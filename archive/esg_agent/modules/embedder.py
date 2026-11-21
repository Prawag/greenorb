"""Generate sentence embeddings for text chunks using SentenceTransformers."""
from sentence_transformers import SentenceTransformer
from typing import List
from loguru import logger
from core.config import settings

_model = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info(f"Loading embedding model: {settings.embedding_model}")
        _model = SentenceTransformer(settings.embedding_model)
    return _model


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts. Returns list of 384-dim float vectors."""
    model = get_model()
    batch_size = 32
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        embeddings = model.encode(batch, normalize_embeddings=True, show_progress_bar=False)
        all_embeddings.extend(embeddings.tolist())
    return all_embeddings


def embed_query(query: str) -> List[float]:
    """Embed a single query string for similarity search."""
    model = get_model()
    return model.encode([query], normalize_embeddings=True)[0].tolist()
