import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 86400 });

export default function mountSentinel5p(sql) {
  return async (req, res) => {
    const hasCreds = process.env.COPERNICUS_CLIENT_ID && 
                     process.env.COPERNICUS_CLIENT_SECRET;
    
    if (!hasCreds) {
      return res.json({
        data: [],
        cached_at: new Date().toISOString(),
        stale: true,
        source: 'ESA Sentinel-5P',
        ttl: 86400,
        error: 'Copernicus credentials required. ' +
               'Register free at dataspace.copernicus.eu ' +
               'then add COPERNICUS_CLIENT_ID and ' +
               'COPERNICUS_CLIENT_SECRET to Backend/.env',
      });
    }
    
    if (hasCreds) {
      // Get token
      const tokenRes = await fetch(
        'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `client_id=cdse-public&username=${encodeURIComponent(process.env.COPERNICUS_USERNAME)}&password=${encodeURIComponent(process.env.COPERNICUS_PASSWORD)}&grant_type=password`
        }
      );
      const tokenData = await tokenRes.json();
      const token = tokenData.access_token;

      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 7 * 86400000).toISOString();

      const odataUrl = `https://catalogue.dataspace.copernicus.eu/odata/v1/Products?` +
        `$filter=Collection/Name eq 'SENTINEL-5P' and ` +
        `Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' ` +
        `and att/OData.CSC.StringAttribute/Value eq 'L2__NO2___') and ` +
        `ContentDate/Start gt ${startDate}&$top=10`;

      const productRes = await fetch(odataUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const products = await productRes.json();
      const data = (products.value || []).map(p => ({
        lat: parseFloat(p.GeoFootprint?.coordinates?.[0]?.[0]?.[1] || 0),
        lng: parseFloat(p.GeoFootprint?.coordinates?.[0]?.[0]?.[0] || 0),
        no2: null,
        ch4: null,
        co: null,
        product_id: p.Id,
        name: p.Name,
        unit: 'mol/m2'
      }));
      
      return res.json({
        data,
        cached_at: new Date().toISOString(),
        stale: false,
        source: 'ESA Sentinel-5P (CDSE OData)',
        ttl: 86400
      });
    }
  };
}
