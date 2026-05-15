# EpiNotes — Notes App

A simple notes app where users can:

- Register and login
- Create, update, and delete notes
- Share notes with other users
- Generate AI summaries and tags using Groq AI

Built with:
- Node.js
- Express.js
- Supabase PostgreSQL
- JWT Authentication
- Groq AI

---

# Features

- User Authentication
- CRUD Notes API
- Share Notes
- AI-generated Tags
- AI-generated Summaries
- JWT-based Authentication
- Password Hashing with bcrypt
- Rate Limiting
- Secure SQL Queries

---

# API Endpoints

## Authentication

### Register
```http
POST /register
```

Request:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

---

### Login
```http
POST /login
```

Request:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "access_token": "JWT_TOKEN"
}
```

---

# Notes

## Get All Notes
```http
GET /notes
```

Headers:
```http
Authorization: Bearer TOKEN
```

---

## Get Single Note
```http
GET /notes/:id
```

---

## Create Note
```http
POST /notes
```

Request:
```json
{
  "title": "My Note",
  "content": "This is note content"
}
```

Automatically generates AI tags.

---

## Update Note
```http
PUT /notes/:id
```

---

## Delete Note
```http
DELETE /notes/:id
```

---

# Share Notes

## Share Note
```http
POST /notes/:id/share
```

Request:
```json
{
  "email": "friend@example.com"
}
```

---

# AI Features

## Generate Summary
```http
POST /notes/:id/summarize
```

Force refresh:
```http
POST /notes/:id/summarize?refresh=true
```

---

## Get Tags
```http
GET /notes/:id/tags
```

---

# Other Routes

## Health Check
```http
GET /health
```

---

## About
```http
GET /about
```

---

# Project Setup

## 1. Install Dependencies

```bash
npm install
```

---

## 2. Create .env File

```env
DATABASE_URL=your_database_url
JWT_SECRET=your_secret_key
Groq_API_KEY=your_Groq_api_key
```

---

## 3. Setup Database

Run the SQL from:

```txt
schema.sql
```

inside Supabase SQL Editor.

---

## 4. Start Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

Server runs on:

```txt
http://localhost:3000
```

---

# Folder Structure

```txt
src/
 ├── routes/
 ├── middleware/
 ├── db.js
 ├── llm.js
 └── server.js

public/
schema.sql
```

---

# Quick Test

## Register User

```bash
curl -X POST http://localhost:3000/register \
-H "Content-Type: application/json" \
-d '{"email":"test@test.com","password":"123456"}'
```

---

## Login User

```bash
curl -X POST http://localhost:3000/login \
-H "Content-Type: application/json" \
-d '{"email":"test@test.com","password":"123456"}'
```

---

## Create Note

```bash
curl -X POST http://localhost:3000/notes \
-H "Authorization: Bearer TOKEN" \
-H "Content-Type: application/json" \
-d '{"title":"Test","content":"Hello world"}'
```
