import { parseStringPromise } from 'xml2js';

async function debug() {
  const urls = [
    { name: 'Floods', url: 'https://www.gdacs.org/xml/rss_fl_14d.xml' },
    { name: 'Cyclones', url: 'https://www.gdacs.org/xml/rss_tc_14d.xml' },
    { name: 'Volcanoes', url: 'https://volcano.si.edu/news/WeeklyVolcanoRSS.xml' }
  ];

  for (const { name, url } of urls) {
    console.log(`--- Debugging ${name} (${url}) ---`);
    try {
      const res = await fetch(url);
      const xml = await res.text();
      // Simple regex check for lat/lng before parsing
      const hasLat = xml.includes('geo:lat') || xml.includes('georss:Point');
      console.log(`Raw XML includes lat/point: ${hasLat}`);

      const parsed = await parseStringPromise(xml);
      const channel = parsed.rss.channel[0];
      const items = channel.item || [];
      console.log(`Found ${items.length} items`);
      if (items.length > 0) {
        const item = items[0];
        console.log('Sample item keys:', Object.keys(item));
        console.log('Sample title:', JSON.stringify(item.title));
        console.log('Sample geo:lat:', JSON.stringify(item['geo:lat']));
        console.log('Sample georss:point:', JSON.stringify(item['georss:Point']));
      }
    } catch (e) {
      console.error(`Error processing ${name}: ${e.message}`);
    }
  }
}

debug();
