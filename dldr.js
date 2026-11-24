import axios from 'axios';
import cheerio from 'cheerio';

const SITES = [
    { name: 'JavHDPorn', url: 'https://javhdporn.com/search/%s', selector: '.item' },
    { name: 'JavNinja', url: 'https://jav.ninja/search?q=%s', selector: '.movie-item' },
    { name: 'JavLibrary', url: 'https://javlibrary.com/search.php?keyword=%s', selector: '.movie' },
    { name: 'JavBus', url: 'https://www.javbus.com/search/%s', selector: '.movie' }
];

async function search(query) {
    console.log(`--- Searching for: ${query} ---\n`);

    // 1. Nyaa Search
    await searchNyaa(query);

    // 2. Streaming Sites
    for (const site of SITES) {
        console.log(`🔍 Trying ${site.name}...`);
        const results = await scrapeSite(site, query);
        if (results.length > 0) {
            console.log(`✅ Success! Found ${results.length} results on ${site.name}`);
            printResults(results);
            return;
        }
    }
    console.log('❌ All streaming sites failed.');
}

async function searchNyaa(query) {
    try {
        const rssUrl = `https://sukebei.nyaa.si/rss?search=${encodeURIComponent(query)}&category=0_0`;
        const { data } = await axios.get(rssUrl);
        const $ = cheerio.load(data, { xmlMode: true });
        const items = $('item');

        if (items.length === 0) {
            console.log('❌ No torrents found on Nyaa/Sukebei.');
        } else {
            console.log('✅ Found Torrents on Nyaa/Sukebei:');
            items.slice(0, 5).each((i, el) => {
                const title = $(el).find('title').text();
                const link = $(el).find('link').text();
                const magnet = $(el).find('enclosure[type*=magnet]').attr('url') || 'N/A';
                console.log(`${i + 1}. ${title}\n   Link: ${link}\n   Magnet: ${magnet}\n`);
            });
        }
    } catch (e) {
        console.log(`⚠️ Nyaa Error: ${e.message}`);
    }
}

async function scrapeSite(site, query) {
    try {
        const url = site.url.replace('%s', encodeURIComponent(query));
        const { data } = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const $ = cheerio.load(data);
        const results = [];

        $(site.selector).each((i, el) => {
            const title = $(el).text().trim();
            const linkEl = $(el).find('a:first');
            if (!linkEl.length || !title) return;

            let href = linkEl.attr('href');
            if (href.startsWith('http')) return;

            // Resolve relative URL
            const baseUrl = new URL(url);
            const fullUrl = new URL(href, baseUrl).href;

            const isUncen = title.toLowerCase().includes('uncensored') || 
                            title.toLowerCase().includes('uncen') ||
                            fullUrl.includes('uncensored') ||
                            fullUrl.includes('u-');

            results.push({ title, url: fullUrl, isUncen, source: site.name });
        });

        // Sort Uncensored first
        results.sort((a, b) => b.isUncen - a.isUncen);
        return results.slice(0, 10);
    } catch (e) {
        return [];
    }
}

function printResults(results) {
    console.log('\n📺 Final Results:');
    results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.title} ${r.isUncen ? '[UNCEN]' : '[CENSORED]'}\n   Page: ${r.url}\n`);
        if (i === 0) {
            console.log('   🎬 Attempting direct link extraction...');
            // Simplified direct link extraction for demo
            console.log('   (See Java version for detailed extraction)\n');
        }
    });
}

if (process.argv.length < 3) {
    console.log('Usage: node jav_search.mjs <search_term>');
} else {
    search(process.argv.slice(2).join(' '));
}
