import { parseStringPromise, processors } from 'xml2js';

async function debug() {
  const url = 'https://www.gdacs.org/xml/rss_fl_14d.xml';
  console.log(`--- Debugging Floods (${url}) ---`);
  try {
    const res = await fetch(url);
    const xml = await res.text();
    // Use tagNameProcessors to strip namespace
    const parsed = await parseStringPromise(xml, {
      tagNameProcessors: [processors.stripPrefix],
      attrNameProcessors: [processors.stripPrefix]
    });
    const item = parsed.rss.channel[0].item[0];
    console.log('Keys:', Object.keys(item));
    console.log('Title:', item.title[0]);
    console.log('Lat:', item.lat ? item.lat[0] : 'MISSING');
    console.log('Point:', item.Point ? item.Point[0] : 'MISSING');
  } catch (e) {
    console.error(e.message);
  }
}

debug();
