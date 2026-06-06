from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import uuid
import math

from core.database import get_db
from core.models import SmartCity

router = APIRouter()

class CityResponse(BaseModel):
    id: uuid.UUID
    name: str
    country: str
    lat: float
    lng: float
    aqi: int | None
    energy_consumption_mwh: float | None
    waste_recycling_rate: float | None
    water_quality_index: float | None

    class Config:
        from_attributes = True

@router.get("/", response_model=List[CityResponse])
def get_cities(db: Session = Depends(get_db)):
    """Get all smart cities and their metrics."""
    cities = db.query(SmartCity).all()
    # Pydantic may struggle if Numeric is not properly cast, but float() handles it.
    return cities

@router.get("/{city_id}", response_model=CityResponse)
def get_city(city_id: uuid.UUID, db: Session = Depends(get_db)):
    city = db.query(SmartCity).filter(SmartCity.id == city_id).first()
    if not city:
        raise HTTPException(status_code=404, detail="City not found")
    return city
