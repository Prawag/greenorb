import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

let clean200Data = [];

try {
  const dataPath = path.join(__dirname, '..', 'data', 'clean200.json');
  const fileContents = fs.readFileSync(dataPath, 'utf8');
  clean200Data = JSON.parse(fileContents);
} catch (error) {
  console.warn("Could not load clean200.json");
}

router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  const results = {};

  if (endIndex < clean200Data.length) {
    results.next = {
      page: page + 1,
      limit: limit
    };
  }
  
  if (startIndex > 0) {
    results.previous = {
      page: page - 1,
      limit: limit
    };
  }

  results.total = clean200Data.length;
  results.data = clean200Data.slice(startIndex, endIndex);
  
  res.json(results);
});

export default router;
