import os
import sys
import uuid
import random

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from core.models import SmartCity
from loguru import logger

INDIAN_CITIES = [
    {"name": "Mumbai", "lat": 19.0760, "lng": 72.8777},
    {"name": "Delhi", "lat": 28.7041, "lng": 77.1025},
    {"name": "Bangalore", "lat": 12.9716, "lng": 77.5946},
    {"name": "Hyderabad", "lat": 17.3850, "lng": 78.4867},
    {"name": "Chennai", "lat": 13.0827, "lng": 80.2707},
    {"name": "Kolkata", "lat": 22.5726, "lng": 88.3639},
    {"name": "Pune", "lat": 18.5204, "lng": 73.8567},
    {"name": "Ahmedabad", "lat": 23.0225, "lng": 72.5714},
    {"name": "Surat", "lat": 21.1702, "lng": 72.8311},
    {"name": "Jaipur", "lat": 26.9124, "lng": 75.7873}
]

def generate_city_data():
    db = SessionLocal()
    try:
        added = 0
        for city in INDIAN_CITIES:
            existing = db.query(SmartCity).filter(SmartCity.name == city["name"]).first()
            
            # Generate somewhat realistic but randomized data
            aqi = random.randint(80, 350)
            energy = random.uniform(15000, 85000)
            waste_rate = random.uniform(15.0, 65.0)
            water_quality = random.uniform(40.0, 95.0)
            
            if not existing:
                sc = SmartCity(
                    id=uuid.uuid4(),
                    name=city["name"],
                    country="India",
                    lat=city["lat"],
                    lng=city["lng"],
                    aqi=aqi,
                    energy_consumption_mwh=round(energy, 2),
                    waste_recycling_rate=round(waste_rate, 2),
                    water_quality_index=round(water_quality, 2)
                )
                db.add(sc)
                added += 1
            else:
                existing.aqi = aqi
                existing.energy_consumption_mwh = round(energy, 2)
                existing.waste_recycling_rate = round(waste_rate, 2)
                existing.water_quality_index = round(water_quality, 2)
                
        db.commit()
        logger.success(f"Seeded {len(INDIAN_CITIES)} smart cities (Added {added} new).")
    except Exception as e:
        logger.error(f"Error seeding cities: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    generate_city_data()
