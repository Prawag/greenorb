"""SQLAlchemy ORM models matching the init.sql schema."""
import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Text, Integer, Numeric, Date,
    DateTime, ForeignKey, CheckConstraint, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from core.database import Base


class Company(Base):
    __tablename__ = "esg_companies"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    domain = Column(Text, unique=True, nullable=False)
    industry = Column(Text, nullable=True)
    country = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    documents = relationship("Document", back_populates="company", cascade="all, delete-orphan")
    esg_values = relationship("EsgValue", back_populates="company", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Company(name='{self.name}', domain='{self.domain}')>"


class Document(Base):
    __tablename__ = "esg_documents"
    __table_args__ = (
        UniqueConstraint("company_id", "content_hash", name="uq_documents_company_hash"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), ForeignKey("esg_companies.id", ondelete="CASCADE"), nullable=False)
    url = Column(Text, nullable=False)
    title = Column(Text, nullable=True)
    report_type = Column(Text, nullable=True)
    date_published = Column(Date, nullable=True)
    local_path = Column(Text, nullable=True)
    content_hash = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    company = relationship("Company", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    esg_values = relationship("EsgValue", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Document(title='{self.title}', url='{self.url}')>"


class Metric(Base):
    __tablename__ = "esg_metrics_def"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category = Column(Text, nullable=False)
    framework = Column(Text, nullable=True)
    metric_name = Column(Text, nullable=False, unique=True)
    unit = Column(Text, nullable=True)
    description = Column(Text, nullable=True)

    esg_values = relationship("EsgValue", back_populates="metric")

    def __repr__(self):
        return f"<Metric(name='{self.metric_name}', category='{self.category}')>"


class EsgValue(Base):
    __tablename__ = "esg_extracted_values"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("esg_documents.id", ondelete="CASCADE"), nullable=False)
    metric_id = Column(UUID(as_uuid=True), ForeignKey("esg_metrics_def.id"), nullable=False)
    company_id = Column(UUID(as_uuid=True), ForeignKey("esg_companies.id"), nullable=False)
    value = Column(Numeric, nullable=True)
    value_text = Column(Text, nullable=True)
    unit = Column(Text, nullable=True)
    year_reported = Column(Integer, nullable=True)
    confidence = Column(Numeric, nullable=True)
    source_text = Column(Text, nullable=True)
    page_number = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    document = relationship("Document", back_populates="esg_values")
    metric = relationship("Metric", back_populates="esg_values")
    company = relationship("Company", back_populates="esg_values")

    def __repr__(self):
        return f"<EsgValue(metric={self.metric_id}, value={self.value})>"


class DocumentChunk(Base):
    __tablename__ = "esg_document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("esg_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    chunk_text = Column(Text, nullable=False)
    page_number = Column(Integer, nullable=True)
    embedding = Column(Vector(384), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    document = relationship("Document", back_populates="chunks")

    def __repr__(self):
        return f"<DocumentChunk(doc={self.document_id}, idx={self.chunk_index})>"
