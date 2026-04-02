import { parseStringPromise, processors } from 'xml2js';

async function debug() {
  const url = 'https://www.gdacs.org/xml/rss_fl_14d.xml';
  console.log(`--- Debugging Floods (${url}) ---`);
  try {
    const res = await fetch(url);
    let xml = await res.text();
    
    // Sanitize XML: replace unescaped ampersands
    xml = xml.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
    
    const parsed = await parseStringPromise(xml, {
      tagNameProcessors: [processors.stripPrefix],
      explicitArray: false
    });
    
    // GDACS structure after stripPrefix can vary
    const items = parsed.rss.channel.item;
    const itemArr = Array.isArray(items) ? items : [items];
    console.log(`Found ${itemArr.length} items`);
    if (itemArr.length > 0) {
      console.log('Sample item:', JSON.stringify(itemArr[0], null, 2));
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

debug();
