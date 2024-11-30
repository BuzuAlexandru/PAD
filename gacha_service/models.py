from datetime import datetime

from database import db
from sqlalchemy import Column, Integer, String, Float, Enum, ForeignKey, DateTime, JSON, create_engine
from sqlalchemy.orm import relationship, sessionmaker
import enum


class RarityEnum(enum.Enum):
    RARE = 'rare'
    SUPER_RARE = 'super_rare'
    ULTRA_RARE = 'ultra_rare'


class Item(db.Model):
    __tablename__ = 'items'

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    rarity = Column(String, nullable=False)  # 'rare', 'super rare', 'ultra rare'
    banner_id = Column(Integer, ForeignKey('banners.id'), nullable=False)

    banner = relationship('Banner', back_populates='items')

class Banner(db.Model):
    __tablename__ = 'banners'

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)

    items = relationship('Item', back_populates='banner')


class GachaHistory(db.Model):
    __tablename__ = 'gacha_history'

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    banner_id = Column(Integer, ForeignKey('banners.id'), nullable=False)
    pulled_items = Column(JSON, nullable=False)  # List of item names or item IDs
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationships
    banner = relationship('Banner')
