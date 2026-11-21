export const CITIES = {
  pune: { id: "pune", name: "Pune", country: "India", iiot_platform: "iudx" },
  surat: { id: "surat", name: "Surat", country: "India", iiot_platform: "iudx" },
  vadodara: { id: "vadodara", name: "Vadodara", country: "India", iiot_platform: "iudx" },
  nashik: { id: "nashik", name: "Nashik", country: "India", iiot_platform: "iudx" },
  bhopal: { id: "bhopal", name: "Bhopal", country: "India", iiot_platform: "iudx" },
  ahmedabad: { id: "ahmedabad", name: "Ahmedabad", country: "India", iiot_platform: "iudx" },
  rajkot: { id: "rajkot", name: "Rajkot", country: "India", iiot_platform: "iudx" },
  lucknow: { id: "lucknow", name: "Lucknow", country: "India", iiot_platform: "iudx" },
  jaipur: { id: "jaipur", name: "Jaipur", country: "India", iiot_platform: "iudx" },
  chandigarh: { id: "chandigarh", name: "Chandigarh", country: "India", iiot_platform: "iudx" },
  indore: { id: "indore", name: "Indore", country: "India", iiot_platform: "iudx" },
  coimbatore: { id: "coimbatore", name: "Coimbatore", country: "India", iiot_platform: "iudx" },
  mumbai: { id: "mumbai", name: "Mumbai", country: "India", iiot_platform: "iudx" },
  delhi: { id: "delhi", name: "Delhi", country: "India", iiot_platform: "iudx" },
  bengaluru: { id: "bengaluru", name: "Bengaluru", country: "India", iiot_platform: "iudx" },
  hyderabad: { id: "hyderabad", name: "Hyderabad", country: "India", iiot_platform: "iudx" },
  chennai: { id: "chennai", name: "Chennai", country: "India", iiot_platform: "iudx" },
  singapore: { id: "singapore", name: "Singapore", country: "Singapore", iiot_platform: "smartcitizen" },
  barcelona: { id: "barcelona", name: "Barcelona", country: "Spain", iiot_platform: "smartcitizen" },
  madrid: { id: "madrid", name: "Madrid", country: "Spain", iiot_platform: "fiware" },
  copenhagen: { id: "copenhagen", name: "Copenhagen", country: "Denmark", iiot_platform: "opensensemap" },
  amsterdam: { id: "amsterdam", name: "Amsterdam", country: "Netherlands", iiot_platform: "opensensemap" },
  seoul: { id: "seoul", name: "Seoul", country: "South Korea", iiot_platform: "openaq" },
  tokyo: { id: "tokyo", name: "Tokyo", country: "Japan", iiot_platform: "openaq" },
  toronto: { id: "toronto", name: "Toronto", country: "Canada", iiot_platform: "opensensemap" },
  dubai: { id: "dubai", name: "Dubai", country: "UAE", iiot_platform: "openaq" },
  helsinki: { id: "helsinki", name: "Helsinki", country: "Finland", iiot_platform: "opensensemap" }
};

export const CITY_IDS = Object.keys(CITIES);
export const getCity = (id) => CITIES[id] || CITIES["pune"];
