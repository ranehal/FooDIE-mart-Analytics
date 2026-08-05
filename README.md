# 🍜 FooDIE-mart Analytics & Deal Intelligence

> **Reverse-Engineered Cryptographic Header Engine, Async HTTP/2 Ingestion Pipeline & Dual SQLite/Parquet Analytics Suite for FoodiBD Mart.**

[![Build & Scrape Status](https://img.shields.io/badge/Scraper_Engine-Operational-10b981?style=for-the-badge&logo=python)](https://github.com/ranehal/FooDIE-mart-Analytics)
[![Products Tracked](https://img.shields.io/badge/Products_Tracked-5%2C159-3b82f6?style=for-the-badge&logo=sqlite)](https://github.com/ranehal/FooDIE-mart-Analytics)
[![Price History Snapshots](https://img.shields.io/badge/Price_Snapshots-20%2C288-8b5cf6?style=for-the-badge&logo=apacheparquet)](https://github.com/ranehal/FooDIE-mart-Analytics)
[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-Live_Hosted-f59e0b?style=for-the-badge&logo=github)](https://ranehal.github.io/FooDIE-mart-Analytics/)
[![License: MIT](https://img.shields.io/badge/License-MIT-gray?style=for-the-badge)](#license)

---

## 📌 Executive Summary

**FooDIE-mart Analytics** is an end-to-end data engineering, reverse-engineering, and price monitoring platform built for **FoodiBD Mart** (Shop #11617 - Banasree, Dhaka).

By decompiling the official FoodiBD Android APK (**v8.0.3**) via JADX, this project unlocked the dynamic cryptographic authentication signature (`sxsrf`), bypassed Cloudflare protections, and built an asynchronous HTTP/2 ingestion engine tracking **5,159+ products** across **24 categories**. The system features a **FastAPI backend**, **Chart.js analytics**, **Apache Parquet columnar storage**, and an automated **Deal Intelligence Engine**.

---

## 🚀 Key Features

- **🔐 APK Reverse-Engineering (`xg.b.c`)**: Decompiled Smali class `xg.b.c` from APK v8.0.3 to reproduce double-Base64 `sxsrf` header signatures (`Base64(Base64(token))`) derived from `cf-ray-status-id-tn` response headers.
- **⚡ Async HTTP/2 Ingestion Engine (`scraper.py`)**: Built with `httpx` and `asyncio`, supporting concurrent category pagination, exponential backoff, and stateful session recovery.
- **💾 Dual OLTP/OLAP Storage**:
  - **SQLite Database (`data/scraper.db`)**: Transactional storage indexed on `product_id`, `category_id`, and `scraped_at`.
  - **Apache Parquet (`data/parquet/`)**: Columnar storage engineered for historical price analytics and low-latency queries.
- **🎯 Deal Intelligence Engine**: Automatically classifies items into **Great Deal**, **Good Buy**, **Wait**, and **All-Time Low (ATL)** using rolling 30-day standard deviation and moving averages.
- **📊 Modern Web Dashboard**: Powered by FastAPI & Chart.js, offering price distribution histograms, category breakdown charts, interactive search, price comparison carts, and static GitHub Pages support.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph APK_Reverse_Engineering ["🔐 Reverse Engineering Phase"]
        A[FoodiBD Android APK v8.0.3] -->|JADX Decompile| B[Smali Analysis: xg.b.c]
        B -->|Extract Logic| C[Double Base64 sxsrf Cryptographic Signature]
        C -->|Header Extraction| D[cf-ray-status-id-tn Handshake]
    end

    subgraph Data_Ingestion ["⚡ Ingestion Engine (scraper.py)"]
        D -->|Inject Headers| E[httpx Async HTTP/2 Session]
        E -->|Host: api.foodibd.com| F[FoodiBD REST API /products/search]
        F -->|Paginate 24 Categories| G[Product & Pricing Extraction]
    end

    subgraph Storage_Pipeline ["💾 Multi-Format Storage"]
        G -->|Transactional Writes| H[(SQLite: data/scraper.db)]
        G -->|Columnar Analytics| I[(Parquet: data/parquet/)]
        H -->|Export Build| J[Static JSON: data/products_export.json]
    end

    subgraph Presentation_Layer ["📊 Presentation & Intelligence"]
        H -->|REST API Engine| K[FastAPI Backend: dashboard.py]
        K -->|Live Local UI| L[Interactive Dashboard: localhost:8800]
        J -->|GitHub Actions| M[GitHub Pages Static Site]
    end
```

---

## 📁 Repository Structure

```
FooDIEscraper/
├── scraper.py              # Async HTTP/2 scraper engine (httpx, asyncio, SQLite, Parquet)
├── dashboard.py            # FastAPI REST backend & dashboard server (:8800)
├── index.html              # Static single-page application dashboard
├── requirements.txt        # Python dependencies (httpx, fastapi, pandas, pyarrow)
├── data/
│   ├── scraper.db          # Transactional SQLite database
│   ├── products_export.json# Static JSON export for GitHub Pages
│   └── parquet/            # Apache Parquet columnar historical files
└── README.md               # Detailed technical specification
```

---

## 🛠️ Data Schema & Storage Architecture

### SQLite Transactional Schema (`data/scraper.db`)
- `categories`: `(category_id INTEGER PRIMARY KEY, name TEXT)`
- `products`: `(product_id INTEGER PRIMARY KEY, name TEXT, category_id INTEGER, unit TEXT, image_url TEXT)`
- `price_history`: `(id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, price REAL, mrp REAL, discount_percent REAL, in_stock BOOLEAN, scraped_at TIMESTAMP)`

---

## ⚡ Quick Start & Setup

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Execute Async Scraper Engine
```bash
# Run HTTP/2 async ingestion pipeline across 24 categories
python scraper.py
```

### 3. Launch FastAPI Dashboard Server
```bash
python dashboard.py
```
Open `http://localhost:8800` in your browser.

---

## 📜 License

Distributed under the MIT License. Trademarks and data belong to FoodiBD / US-Bangla Group. Built for analytical research.
