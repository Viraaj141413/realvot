const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { chromium } = require('playwright');

const app = express();
const server = createServer(app);
const io = new Server(server);

app.use(express.static('static'));
app.use(express.json());

const userAgents = [
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', locale: 'en-US', region: 'United States' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36', locale: 'en-GB', region: 'United Kingdom' },
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:112.0) Gecko/20100101 Firefox/112.0', locale: 'fr-FR', region: 'France' },
    { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1', locale: 'ja-JP', region: 'Japan' },
    { ua: 'Mozilla/5.0 (Linux; Android 14; SM-G993B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36', locale: 'de-DE', region: 'Germany' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Safari/605.1.15', locale: 'es-ES', region: 'Spain' },
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.0.0', locale: 'en-AU', region: 'Australia' },
    { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', locale: 'pt-BR', region: 'Brazil' },
    { ua: 'Mozilla/5.0 (iPad; CPU OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1', locale: 'zh-CN', region: 'China' },
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36', locale: 'it-IT', region: 'Italy' }
];

function normalizeUrl(inputUrl) {
    let url = inputUrl.trim();
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    if (url.includes('tiktok.com') && !url.match(/tiktok\.com\/@[\w.]+\/video\/\d+$/)) {
        url = url.replace(/tiktok\.com.*(@[\w.]+\/video\/\d+)/, 'tiktok.com/$1');
    }
    return url;
}

async function customCaptchaBlocker(page, socketId, viewIndex) {
    const captchaSelectors = [
        'iframe[src*="captcha"]',
        'div[class*="recaptcha"]',
        'div[class*="turnstile"]',
        'button[class*="verify"]',
        'input[type="checkbox"][class*="captcha"]',
        'div[class*="slider"]',
        'div[class*="captcha-container"]',
        'iframe[src*="cloudflare"]'
    ];
    try {
        for (const selector of captchaSelectors) {
            const element = await page.$(selector);
            if (element) {
                const boundingBox = await element.boundingBox();
                if (boundingBox) {
                    await page.mouse.move(
                        boundingBox.x + boundingBox.width / 2 + Math.random() * 10 - 5,
                        boundingBox.y + boundingBox.height / 2 + Math.random() * 10 - 5,
                        { steps: 15 }
                    );
                    await page.waitForTimeout(Math.floor(Math.random() * 400 + 200));
                    if (selector.includes('slider')) {
                        await page.mouse.down();
                        await page.mouse.move(
                            boundingBox.x + boundingBox.width * 1.5 + Math.random() * 20 - 10,
                            boundingBox.y + boundingBox.height / 2 + Math.random() * 5 - 2.5,
                            { steps: 25 }
                        );
                        await page.mouse.up();
                    } else {
                        await element.click({ timeout: 3000 });
                    }
                    console.log(`Attempted to block/solve CAPTCHA for view ${viewIndex}`);
                    io.to(socketId).emit('bot_update', { message: `Attempted to block/solve CAPTCHA for view ${viewIndex}` });
                    try {
                        const screenshot = await page.screenshot({ fullPage: false });
                        io.to(socketId).emit('screenshot', { image: screenshot.toString('base64'), context: `CAPTCHA detected for view ${viewIndex}` });
                    } catch {}
                    await page.waitForTimeout(3000);
                    return true; // Skip view if CAPTCHA detected
                }
            }
        }
        return false;
    } catch (e) {
        console.log(`Error in custom CAPTCHA blocker for view ${viewIndex}: ${e}`);
        io.to(socketId).emit('bot_update', { message: `Error in custom CAPTCHA blocker for view ${viewIndex}: ${e}` });
        return false;
    }
}

async function closePopups(page, socketId, viewIndex) {
    const popupSelectors = [
        'button[data-e2e="modal-close-inner-button"]',
        'div[class*="tiktok-modal"] button',
        'button[aria-label="Close"]',
        'button[class*="close"]',
        'div[id*="popup"] button',
        'div[class*="dialog"] button',
        'div[class*="cookie-banner"] button',
        'button[data-e2e="banner-close-button"]',
        'button[class*="accept"]',
        'button[class*="decline"]',
        'button[data-e2e="reject-all"]',
        'button[aria-label="Dismiss"]'
    ];
    try {
        for (let i = 0; i < 4; i++) {
            for (const selector of popupSelectors) {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    try {
                        await element.click({ timeout: 2000 });
                        console.log(`Closed a pop-up for view ${viewIndex}`);
                        io.to(socketId).emit('bot_update', { message: `Closed a pop-up for view ${viewIndex}` });
                        await page.waitForTimeout(Math.floor(Math.random() * 500 + 500));
                    } catch {}
                }
            }
            await page.waitForTimeout(Math.floor(Math.random() * 1000 + 500));
        }
    } catch (e) {
        console.log(`Error closing pop-ups for view ${viewIndex}: ${e}`);
        io.to(socketId).emit('bot_update', { message: `Error closing pop-ups for view ${viewIndex}: ${e}` });
    }
}

async function processView(url, viewIndex, totalViews, socketId, browser) {
    let context, page;
    try {
        const { ua, locale, region } = userAgents[Math.floor(Math.random() * userAgents.length)];
        const isMobile = ua.includes('Mobile') || ua.includes('iPhone') || ua.includes('Android') || ua.includes('iPad');
        const viewport = {
            width: isMobile ? Math.floor(Math.random() * (414 - 360 + 1)) + 360 : Math.floor(Math.random() * (1920 - 800 + 1)) + 800,
            height: isMobile ? Math.floor(Math.random() * (896 - 640 + 1)) + 640 : Math.floor(Math.random() * (1080 - 600 + 1)) + 600
        };

        context = await browser.newContext({
            userAgent: ua,
            viewport,
            deviceScaleFactor: Math.random() * 1.5 + 1,
            isMobile,
            hasTouch: isMobile,
            locale,
            javaScriptEnabled: true,
            bypassCSP: true,
            extraHTTPHeaders: {
                'Accept-Language': locale,
                'DNT': '1',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-Dest': 'document',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!context) {
            throw new Error('Failed to create browser context');
        }
        console.log(`Context created for view ${viewIndex}/${totalViews} from ${region}`);
        io.to(socketId).emit('bot_update', { message: `Context created for view ${viewIndex}/${totalViews} from ${region}` });

        await context.addInitScript(`
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            Object.defineProperty(navigator, 'platform', { get: () => '${isMobile ? 'iPhone' : 'Win32'}' });
            Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
            Object.defineProperty(window, 'chrome', { get: () => ({ runtime: {}, webstore: {} }) });
            Object.defineProperty(navigator, 'languages', { get: () => ['${locale}', 'en'] });
            delete window['navigator']['webdriver'];
            window.navigator.permissions = { query: () => Promise.resolve({ state: 'granted' }) };
            Object.defineProperty(navigator, 'userAgent', { get: () => '${ua}' });
            window.screen = {
                width: ${viewport.width},
                height: ${viewport.height},
                availWidth: ${viewport.width},
                availHeight: ${viewport.height},
                colorDepth: 24,
                pixelDepth: 24
            };
            HTMLCanvasElement.prototype.getContext = (function(original) {
                return function() {
                    const context = original.apply(this, arguments);
                    const originalGetImageData = context.getImageData;
                    context.getImageData = function() {
                        const data = originalGetImageData.apply(this, arguments);
                        for (let i = 0; i < data.data.length; i++) {
                            data.data[i] += Math.floor(Math.random() * 10 - 5);
                        }
                        return data;
                    };
                    return context;
                };
            })(HTMLCanvasElement.prototype.getContext);
            WebGLRenderingContext.prototype.getParameter = (function(original) {
                return function(param) {
                    if (param === 37445 || param === 37446) {
                        return ['Intel Inc.', 'Intel(R) Iris(TM) Graphics 6100'][Math.floor(Math.random() * 2)];
                    }
                    return original.apply(this, arguments);
                };
            })(WebGLRenderingContext.prototype.getParameter);
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => Math.floor(Math.random() * 4 + 2) });
            Object.defineProperty(navigator, 'deviceMemory', { get: () => Math.floor(Math.random() * 4 + 4) });
            Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'PDF Viewer' }, { name: 'Chrome PDF Viewer' }] });
            Object.defineProperty(navigator, 'connection', { get: () => ({ type: 'wifi', effectiveType: '4g', rtt: Math.floor(Math.random() * 50 + 50) }) });
        `);

        await context.clearCookies();
        await context.clearPermissions();

        page = await context.newPage();
        if (!page) {
            throw new Error('Failed to create new page');
        }
        console.log(`Page created for view ${viewIndex}/${totalViews} from ${region}`);
        io.to(socketId).emit('bot_update', { message: `Page created for view ${viewIndex}/${totalViews} from ${region}` });

        let pageLoaded = false;
        let responseStatus, pageTitle;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const timeout = 120000; // 120s
                const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
                responseStatus = response ? response.status() : 'No response';
                pageTitle = await page.title().catch(() => 'Unknown title');
                if (response && response.status() >= 400) {
                    console.log(`HTTP error ${response.status()} on attempt ${attempt+1} for view ${viewIndex} from ${region}, title: ${pageTitle}`);
                    io.to(socketId).emit('bot_update', { message: `HTTP error ${response.status()} on attempt ${attempt+1} for view ${viewIndex} from ${region}, title: ${pageTitle}` });
                    if (response.status() === 404 || response.status() === 403) {
                        throw new Error('Video not available or restricted');
                    }
                    try {
                        const screenshot = await page.screenshot({ fullPage: false });
                        io.to(socketId).emit('screenshot', { image: screenshot.toString('base64'), context: `HTTP error ${response.status()} for view ${viewIndex}` });
                    } catch {}
                    continue;
                }
                pageLoaded = true;
                console.log(`Video page loaded successfully for view ${viewIndex}/${totalViews} from ${region}, status: ${responseStatus}, title: ${pageTitle}`);
                io.to(socketId).emit('bot_update', { message: `Video page loaded successfully for view ${viewIndex}/${totalViews} from ${region}, status: ${responseStatus}, title: ${pageTitle}` });
                break;
            } catch (e) {
                console.log(`Navigation error on attempt ${attempt+1} for view ${viewIndex} from ${region}: ${e}`);
                io.to(socketId).emit('bot_update', { message: `Navigation error on attempt ${attempt+1} for view ${viewIndex} from ${region}: ${e}` });
                try {
                    const screenshot = await page.screenshot({ fullPage: false });
                    io.to(socketId).emit('screenshot', { image: screenshot.toString('base64'), context: `Navigation error for view ${viewIndex}` });
                } catch {}
                if (attempt === 4) throw e;
                await page.waitForTimeout(Math.pow(2, attempt) * 3000 + Math.random() * 1000); // Exponential backoff
            }
        }

        if (!pageLoaded) {
            console.log(`Failed to load video page for view ${viewIndex}/${totalViews} from ${region} after retries`);
            io.to(socketId).emit('bot_update', { message: `Failed to load video page for view ${viewIndex}/${totalViews} from ${region} after retries` });
            return;
        }

        const errorMessage = await page.$('div[class*="error"],h1,h2,h3,p[class*="not-found"],div[class*="unavailable"]');
        if (errorMessage) {
            const text = await errorMessage.innerText();
            if (text.toLowerCase().includes('not available') || text.toLowerCase().includes('not found') || text.toLowerCase().includes('unavailable')) {
                console.log(`Error: Video not available for view ${viewIndex}/${totalViews} from ${region}, message: ${text}`);
                io.to(socketId).emit('bot_update', { message: `Error: Video not available for view ${viewIndex}/${totalViews} from ${region}, message: ${text}` });
                return;
            }
        }

        if (await customCaptchaBlocker(page, socketId, viewIndex)) {
            console.log(`Skipping view ${viewIndex}/${totalViews} from ${region} due to unresolved CAPTCHA`);
            io.to(socketId).emit('bot_update', { message: `Skipping view ${viewIndex}/${totalViews} from ${region} due to unresolved CAPTCHA` });
            return;
        }

        await closePopups(page, socketId, viewIndex);
        await page.waitForTimeout(Math.floor(Math.random() * 1000 + 500)); // 0.5-1.5s delay

        try {
            const screenshot = await page.screenshot({ fullPage: false });
            io.to(socketId).emit('screenshot', { image: screenshot.toString('base64'), context: `Initial video page for view ${viewIndex} from ${region}` });
        } catch (e) {
            console.log(`Error capturing initial screenshot for view ${viewIndex}/${totalViews} from ${region}: ${e}`);
            io.to(socketId).emit('bot_update', { message: `Error capturing initial screenshot for view ${viewIndex}/${totalViews} from ${region}: ${e}` });
        }

        let viewed = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const videoElement = await page.$('video, div[data-e2e="video-player"]');
                if (videoElement) {
                    const boundingBox = await videoElement.boundingBox();
                    if (boundingBox) {
                        await page.mouse.move(
                            boundingBox.x + boundingBox.width / 2 + Math.random() * 10 - 5,
                            boundingBox.y + boundingBox.height / 2 + Math.random() * 10 - 5,
                            { steps: 15 }
                        );
                        await page.waitForTimeout(Math.floor(Math.random() * 400 + 200)); // 0.2-0.6s
                        // Ensure video plays for 5-10s
                        const playDuration = Math.floor(Math.random() * 5000 + 5000); // 5-10s
                        await page.waitForTimeout(playDuration);
                        console.log(`Video played for ${playDuration/1000}s for view ${viewIndex}/${totalViews} from ${region}`);
                        io.to(socketId).emit('bot_update', { message: `Video played for ${playDuration/1000}s for view ${viewIndex}/${totalViews} from ${region}` });
                        viewed = true;

                        // Screenshot 3 seconds after video load
                        await page.waitForTimeout(3000);
                        try {
                            const screenshot = await page.screenshot({ fullPage: false });
                            io.to(socketId).emit('screenshot', { image: screenshot.toString('base64'), context: `3 seconds after video load for view ${viewIndex} from ${region}` });
                            console.log(`Captured screenshot 3 seconds after video load for view ${viewIndex}/${totalViews} from ${region}`);
                            io.to(socketId).emit('bot_update', { message: `Captured screenshot 3 seconds after video load for view ${viewIndex}/${totalViews} from ${region}` });
                        } catch (e) {
                            console.log(`Error capturing 3-second screenshot for view ${viewIndex}/${totalViews} from ${region}: ${e}`);
                            io.to(socketId).emit('bot_update', { message: `Error capturing 3-second screenshot for view ${viewIndex}/${totalViews} from ${region}: ${e}` });
                        }
                        break;
                    }
                } else {
                    console.log(`Video element not found for view ${viewIndex}/${totalViews} from ${region}, attempt ${attempt+1}`);
                    io.to(socketId).emit('bot_update', { message: `Video element not found for view ${viewIndex}/${totalViews} from ${region}, attempt ${attempt+1}` });
                }
            } catch (e) {
                console.log(`Error playing video for view ${viewIndex}/${totalViews} from ${region}, attempt ${attempt+1}: ${e}`);
                io.to(socketId).emit('bot_update', { message: `Error playing video for view ${viewIndex}/${totalViews} from ${region}, attempt ${attempt+1}: ${e}` });
            }
            await page.waitForTimeout(Math.floor(Math.random() * 1500 + 500)); // 0.5-2s
        }

        if (!viewed) {
            console.log(`Skipping view ${viewIndex}/${totalViews} from ${region} due to persistent video load failure`);
            io.to(socketId).emit('bot_update', { message: `Skipping view ${viewIndex}/${totalViews} from ${region} due to persistent video load failure` });
            return;
        }

        // Human-like behavior
        for (let j = 0; j < Math.floor(Math.random() * 3 + 2); j++) {
            const scrollDistance = Math.floor(Math.random() * 400 + 100);
            await page.evaluate(`window.scrollBy(0, ${scrollDistance * (Math.random() > 0.5 ? 1 : -1)})`);
            await page.waitForTimeout(Math.floor(Math.random() * 1500 + 1000)); // 1-2.5s
        }

        for (let j = 0; j < Math.floor(Math.random() * 3 + 2); j++) {
            const x = Math.floor(Math.random() * viewport.width * 0.8 + viewport.width * 0.1);
            const y = Math.floor(Math.random() * viewport.height * 0.8 + viewport.height * 0.1);
            await page.mouse.move(x, y, { steps: Math.floor(Math.random() * 15 + 10) });
            await page.waitForTimeout(Math.floor(Math.random() * 600 + 400)); // 0.4-1s
        }

        if (Math.random() < 0.3) {
            await page.mouse.click(
                Math.floor(Math.random() * viewport.width * 0.8 + viewport.width * 0.1),
                Math.floor(Math.random() * viewport.height * 0.8 + viewport.height * 0.1)
            );
            console.log(`Random click performed for view ${viewIndex}/${totalViews} from ${region}`);
            io.to(socketId).emit('bot_update', { message: `Random click performed for view ${viewIndex}/${totalViews} from ${region}` });
        }

        console.log(`Registered view ${viewIndex}/${totalViews} from ${region} for ${url}`);
        io.to(socketId).emit('bot_update', { message: `Registered view ${viewIndex}/${totalViews} from ${region} for ${url}` });

        try {
            const screenshot = await page.screenshot({ fullPage: false });
            io.to(socketId).emit('screenshot', { image: screenshot.toString('base64'), context: `Final video page for view ${viewIndex} from ${region}` });
        } catch (e) {
            console.log(`Error capturing final screenshot for view ${viewIndex}/${totalViews} from ${region}: ${e}`);
            io.to(socketId).emit('bot_update', { message: `Error capturing final screenshot for view ${viewIndex}/${totalViews} from ${region}: ${e}` });
        }

    } catch (e) {
        console.log(`Error on view ${viewIndex}/${totalViews} from ${region}: ${e}`);
        io.to(socketId).emit('bot_update', { message: `Error on view ${viewIndex}/${totalViews} from ${region}: ${e}` });
    } finally {
        if (page) await page.close().catch(e => console.log(`Error closing page: ${e}`));
        if (context) await context.close().catch(e => console.log(`Error closing context: ${e}`));
    }
}

async function runViewBot(url, views, socketId) {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl.match(/https:\/\/www\.tiktok\.com\/@[\w.]+\/video\/\d+/)) {
        io.to(socketId).emit('bot_update', { message: 'Invalid URL. Only TikTok video URLs (@username/video/ID) are supported.' });
        return;
    }
    let browser;
    try {
        browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'] });
        console.log('Browser launched successfully');
        io.to(socketId).emit('bot_update', { message: 'Browser launched successfully' });

        const maxConcurrent = 1; // Sequential to avoid detection
        for (let i = 0; i < Math.min(views, 1000); i++) {
            await processView(normalizedUrl, i + 1, views, socketId, browser);
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 2000 + 1000))); // 1-3s delay between views
        }

        console.log('Bot finished');
        io.to(socketId).emit('bot_update', { message: 'Bot finished' });
    } catch (e) {
        console.log(`Bot error: ${e}`);
        io.to(socketId).emit('bot_update', { message: `Bot error: ${e}` });
    } finally {
        if (browser) await browser.close().catch(e => console.log(`Error closing browser: ${e}`));
    }
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/static/index.html');
});

app.post('/start', async (req, res) => {
    let { url, views, socketId } = req.body;
    url = normalizeUrl(url);
    if (!url.match(/https:\/\/www\.tiktok\.com\/@[\w.]+\/video\/\d+/)) {
        return res.status(400).json({ error: 'Invalid URL. Only TikTok video (@username/video/ID) URLs are supported' });
    }
    if (!Number.isInteger(views) || views < 1 || views > 1000) {
        return res.status(400).json({ error: 'Views must be between 1 and 1000' });
    }
    runViewBot(url, views, socketId).catch(e => {
        console.log(`Bot error: ${e}`);
        io.to(socketId).emit('bot_update', { message: `Bot error: ${e}` });
    });
    res.status(200).json({ message: 'Bot started' });
});

server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});