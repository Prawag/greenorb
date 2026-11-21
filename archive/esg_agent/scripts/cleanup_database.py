import os
import sys
from loguru import logger

# Ensure we can import from core
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from core.models import EsgValue, Metric

def cleanup():
    db = SessionLocal()
    try:
        # 1. Nullify numeric values for text-only/descriptive metrics
        text_metrics = db.query(Metric).filter(
            Metric.metric_name.ilike("%Climate Targets%") | 
            Metric.metric_name.ilike("%Sustainability Investment%") |
            Metric.metric_name.ilike("%Ethics Policy%")
        ).all()
        
        text_metric_ids = [m.id for m in text_metrics]
        logger.info(f"Identified {len(text_metric_ids)} text-only metric definitions.")
        
        updated_text = db.query(EsgValue).filter(
            EsgValue.metric_id.in_(text_metric_ids),
            EsgValue.value.isnot(None)
        ).update({EsgValue.value: None}, synchronize_session=False)
        logger.success(f"Nullified float values for {updated_text} text-based metrics.")

        # 2. Delete garbage emission/water values that represent table/page indexes
        garbage_count = 0
        all_vals = db.query(EsgValue).all()
        for val in all_vals:
            val_text_lower = str(val.value_text).lower() if val.value_text else ""
            
            is_garbage = False
            if "table" in val_text_lower or "figure" in val_text_lower or "page" in val_text_lower or "fig" in val_text_lower:
                is_garbage = True
            elif val.value is not None:
                # Get metric info
                metric = db.query(Metric).filter(Metric.id == val.metric_id).first()
                if metric:
                    name_lower = metric.metric_name.lower()
                    # If it's an emission metric and value is unreasonably small (< 100)
                    if "emissions" in name_lower or "ghg" in name_lower:
                        if val.value < 100:
                            is_garbage = True
                            
            if is_garbage:
                logger.info(f"Deleting garbage row - Value: {val.value} | Text: {val.value_text}")
                db.delete(val)
                garbage_count += 1
                
        db.commit()
        logger.success(f"Deleted {garbage_count} garbage numeric metric entries from the database.")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Cleanup failed: {e}")
    finally:
        db.close()

if __name__ == '__main__':
    cleanup()
