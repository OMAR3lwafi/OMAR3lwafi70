// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/).
import { Actor } from 'apify';
// Puppeteer - Headless Chrome Node.js API (Read more at https://pptr.dev/)
import puppeteer from 'puppeteer';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init().
await Actor.init();

interface Input {
    videoId: string;
}
// Structure of input is defined in input_schema.json
const input = await Actor.getInput<Input>();
if (!input) throw new Error("Input is missing!");
const { videoId } = input;

console.log(`Searching for YouTube video with ID: ${videoId}`);

try {
    // Launch a headless browser
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Set a reasonable viewport
    await page.setViewport({ width: 1280, height: 800 });
    
    // First try direct URL approach - most reliable if ID is correct
    const directUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Navigating to direct video URL: ${directUrl}`);
    
    await page.goto(directUrl, { waitUntil: 'networkidle2' });
    
    // Check if we're on a valid video page by looking for the title
    const videoTitle = await page.evaluate(() => {
        const titleElement = document.querySelector('h1.title.style-scope.ytd-video-primary-info-renderer');
        if (titleElement) return titleElement.textContent?.trim();
        
        // Alternative selectors for different YouTube layouts
        const altTitleElement = document.querySelector('h1.watch-title-container') || 
                               document.querySelector('h1 yt-formatted-string');
        
        return altTitleElement ? altTitleElement.textContent?.trim() : null;
    });
    
    if (videoTitle) {
        console.log(`Found video directly: "${videoTitle}" at ${directUrl}`);
        
        // Save the result to dataset
        const result = {
            videoId,
            title: videoTitle,
            url: directUrl
        };
        
        await Actor.pushData(result);
        console.log('Data saved to dataset:', result);
    } else {
        // If direct URL didn't work, try searching
        console.log('Could not find video directly, trying search...');
        
        // Navigate to YouTube search page
        const searchUrl = `https://www.youtube.com/results?search_query=${videoId}`;
        console.log(`Navigating to search URL: ${searchUrl}`);
        
        await page.goto(searchUrl, { waitUntil: 'networkidle2' });
        
        // Wait a bit for JavaScript to load content
        await page.waitForTimeout(2000);
        
        // Extract video information from search results
        const videoInfo = await page.evaluate((id) => {
            // Find video elements that might contain our target video
            const videoElements = Array.from(document.querySelectorAll('a#video-title, a.yt-simple-endpoint.style-scope.ytd-video-renderer'));
            
            for (const element of videoElements) {
                const href = element.getAttribute('href');
                if (href && href.includes(id)) {
                    return {
                        title: element.textContent?.trim() || 'YouTube Video',
                        url: `https://www.youtube.com${href}`
                    };
                }
            }
            
            return null;
        }, videoId);
        
        if (videoInfo) {
            console.log(`Found video via search: "${videoInfo.title}" at ${videoInfo.url}`);
            
            // Save the result to dataset
            const result = {
                videoId,
                title: videoInfo.title,
                url: videoInfo.url
            };
            
            await Actor.pushData(result);
            console.log('Data saved to dataset:', result);
        } else {
            console.log('Could not find video via search either. Saving direct link as fallback.');
            
            // Save fallback result
            const result = {
                videoId,
                title: 'YouTube Video (direct link)',
                url: directUrl
            };
            
            await Actor.pushData(result);
            console.log('Fallback data saved to dataset:', result);
        }
    }
    
    // Close the browser
    await browser.close();
    
} catch (error) {
    console.error('Error during scraping:', error);
    
    // Even if scraping fails, we can still provide a direct link
    const result = {
        videoId,
        title: 'YouTube Video (direct link)',
        url: `https://www.youtube.com/watch?v=${videoId}`
    };
    
    await Actor.pushData(result);
    console.log('Fallback data saved to dataset:', result);
}

// Gracefully exit the Actor process. It's recommended to quit all Actors with an exit().
await Actor.exit();
