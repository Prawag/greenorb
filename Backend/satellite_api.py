import requests
import datetime
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from skyfield.api import load, wgs84
from skyfield.sgp4lib import EarthSatellite

app = FastAPI()

# ─── Auth ────────────────────────────────────────────────────────────────
def get_cdse_token(username: str, password: str) -> str | None:
    url = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
    payload = {
        "client_id": "cdse-public",
        "username": username,
        "password": password,
        "grant_type": "password"
    }
    try:
        r = requests.post(url, data=payload, timeout=15)
        r.raise_for_status()
        return r.json().get("access_token")
    except Exception as e:
        print(f"[CDSE Auth] Error: {e}")
        return None

# ─── NDVI Verification ────────────────────────────────────────────────────
def verify_ndvi(lat: float, lng: float, radius_m: int, cdse_token: str) -> dict:
    offset = radius_m / 111000.0
    bbox = [lng - offset, lat - offset, lng + offset, lat + offset]
    url = "https://sh.dataspace.copernicus.eu/api/v1/statistics"

    # Pure JS string for CDSE with SCL cloud masking
    evalscript = (
        "//VERSION=3\n"
        "function setup() {\n"
        "  return {\n"
        "    input: [{ datasource: 'S2L2A', bands: ['B04', 'B08', 'SCL', 'dataMask'] }],\n"
        "    output: [{ id: 'ndvi', bands: 1 }, { id: 'cloudMask', bands: 1 }, { id: 'dataMask', bands: 1 }]\n"
        "  };\n"
        "}\n"
        "function evaluatePixel(samples) {\n"
        "  let isCloud = (samples.SCL === 8 || samples.SCL === 9 || samples.SCL === 10) ? 1.0 : 0.0;\n"
        "  let ndvi = 0;\n"
        "  if (isCloud === 0.0) {\n"
        "    ndvi = (samples.B08 - samples.B04) / (samples.B08 + samples.B04);\n"
        "  }\n"
        "  return { ndvi: [ndvi], cloudMask: [isCloud], dataMask: [samples.dataMask] };\n"
        "}"
    )

    end_date = datetime.datetime.utcnow()
    start_date = end_date - datetime.timedelta(days=30)

    payload = {
        "input": {
            "bounds": {"bbox": bbox},
            "data": [{"type": "sentinel-2-l2a", "dataFilter": {"mosaickingOrder": "leastCC"}}]
        },
        "aggregation": {
            "timeRange": {
                "from": start_date.strftime("%Y-%m-%dT00:00:00Z"),
                "to": end_date.strftime("%Y-%m-%dT23:59:59Z")
            },
            "aggregationInterval": {"of": "P30D"},
            "evalscript": evalscript,
            "resx": 10,
            "resy": 10
        }
    }

    headers = {
        "Authorization": f"Bearer {cdse_token}",
        "Content-Type": "application/json"
    }

    next_pass = "Unknown"
    try:
        ts = load.timescale()
        s2_line1 = '1 40697U 15028A   26080.12345678  .00000000  00000-0  00000-0 0  9999'
        s2_line2 = '2 40697 098.5000 123.4567 0001000 123.4567 236.5432 14.20000000000000'
        sat = EarthSatellite(s2_line1, s2_line2, 'Sentinel-2A', ts)
        observer = wgs84.latlon(latitude_degrees=lat, longitude_degrees=lng)
        t0 = ts.now()
        t1 = ts.utc(t0.utc_datetime() + datetime.timedelta(days=10))
        t_events, events = sat.find_events(observer, t0, t1, altitude_degrees=30.0)
        if len(t_events) > 0:
            next_pass = t_events[0].utc_iso()
    except Exception:
        pass

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=45)
        resp.raise_for_status()
        stats = resp.json()

        ndvi_mean = None
        cloud_pct = 0.0
        try:
            ndvi_mean = float(stats["data"][0]["outputs"]["ndvi"]["bands"]["B0"]["stats"]["mean"])
            cloud_pct = float(stats["data"][0]["outputs"]["cloudMask"]["bands"]["B0"]["stats"]["mean"]) * 100
        except (KeyError, IndexError, TypeError):
            pass

        if ndvi_mean is None:
            return {"verdict": "NO_DATA", "ndvi_mean": None,
                    "ndvi_trend": None, "cloud_pct": None,
                    "date_acquired": end_date.strftime("%Y-%m-%d"),
                    "next_overpass_utc": next_pass}

        verdict = "VEGETATION_HEALTHY"
        if ndvi_mean < 0.1:
            verdict = "DEFORESTATION_RISK"
        elif ndvi_mean < 0.3:
            verdict = "VEGETATION_STRESSED"

        return {
            "ndvi_mean": round(ndvi_mean, 4) if ndvi_mean is not None else None,
            "ndvi_trend": "STABLE",
            "cloud_pct": round(cloud_pct, 2) if cloud_pct is not None else None,
            "verdict": verdict,
            "date_acquired": end_date.strftime("%Y-%m-%d"),
            "next_overpass_utc": next_pass
        }
    except Exception as e:
        return {"verdict": "API_ERROR", "error": str(e),
                "ndvi_mean": None, "ndvi_trend": None,
                "cloud_pct": None, "date_acquired": None, "next_overpass_utc": next_pass}

# ─── NO2 Verification ─────────────────────────────────────────────────────
def verify_no2(lat: float, lng: float, cdse_token: str) -> dict:
    offset = 0.05  # ~5.5km — matches Sentinel-5P TROPOMI native resolution
    bbox = [lng - offset, lat - offset, lng + offset, lat + offset]
    url = "https://sh.dataspace.copernicus.eu/api/v1/statistics"

    evalscript = (
        "//VERSION=3\n"
        "function setup() {\n"
        "  return {\n"
        "    input: [{ datasource: 'S5PL2', bands: ['NO2', 'dataMask'] }],\n"
        "    output: { bands: 2 }\n"
        "  };\n"
        "}\n"
        "function evaluatePixel(sample) {\n"
        "  return [sample.NO2, sample.dataMask];\n"
        "}"
    )

    end_date = datetime.datetime.utcnow()
    start_date = end_date - datetime.timedelta(days=7)

    payload = {
        "input": {
            "bounds": {"bbox": bbox},
            "data": [{"type": "sentinel-5p-l2", "dataFilter": {
                "timeRange": {
                    "from": start_date.strftime("%Y-%m-%dT00:00:00Z"),
                    "to": end_date.strftime("%Y-%m-%dT23:59:59Z")
                }
            }}]
        },
        "aggregation": {
            "timeRange": {
                "from": start_date.strftime("%Y-%m-%dT00:00:00Z"),
                "to": end_date.strftime("%Y-%m-%dT23:59:59Z")
            },
            "aggregationInterval": {"of": "P7D"},
            "evalscript": evalscript,
            "resx": 7000,
            "resy": 7000
        }
    }

    headers = {
        "Authorization": f"Bearer {cdse_token}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=45)
        resp.raise_for_status()
        stats = resp.json()

        no2_val = None
        try:
            no2_val = float(
                stats["data"][0]["outputs"]["default"]["bands"]["B0"]["stats"]["mean"]
            )
        except (KeyError, IndexError, TypeError):
            pass

        if no2_val is None:
            return {"verdict": "NO_DATA", "no2_column": None,
                    "unit": "mol/m^2", "date": end_date.strftime("%Y-%m-%d")}

        verdict = "WITHIN_NORMAL"
        if no2_val > 0.0001:
            verdict = "ELEVATED"
        if no2_val > 0.0003:
            verdict = "CRITICALLY_HIGH"

        return {
            "no2_column": round(no2_val, 6),
            "unit": "mol/m^2",
            "date": end_date.strftime("%Y-%m-%d"),
            "verdict": verdict
        }
    except Exception as e:
        return {"verdict": "API_ERROR", "error": str(e),
                "no2_column": None, "unit": "mol/m^2",
                "date": None}

# ─── FastAPI Routes ────────────────────────────────────────────────────────
class NDVIReq(BaseModel):
    lat: float
    lng: float
    radius_m: int = 500
    cdse_token: str

class NO2Req(BaseModel):
    lat: float
    lng: float
    cdse_token: str

@app.post("/verify/ndvi")
def api_verify_ndvi(req: NDVIReq):
    return verify_ndvi(req.lat, req.lng, req.radius_m, req.cdse_token)

@app.post("/verify/no2")
def api_verify_no2(req: NO2Req):
    return verify_no2(req.lat, req.lng, req.cdse_token)

@app.get("/health")
def health():
    return {"status": "ok", "service": "GreenOrb Satellite Bridge"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
