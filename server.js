const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// Serve static files from 'public' directory
app.use(express.static('public'));
app.use(express.json());

// Open database connection
const dbPath = path.resolve(__dirname, 'iv_flat.db');

// Reassemble db from parts if it doesn't exist
if (!fs.existsSync(dbPath)) {
    console.log('Database not found. Reassembling from 20MB parts...');
    const parts = fs.readdirSync(__dirname).filter(f => f.startsWith('iv_flat_part_')).sort();
    if (parts.length > 0) {
        for (const part of parts) {
            fs.appendFileSync(dbPath, fs.readFileSync(path.resolve(__dirname, part)));
        }
        console.log('Database successfully reassembled.');
    } else {
        console.error('Database parts not found! Server might fail.');
    }
}
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the iv_flat database.');
});

// Helper function to query the database
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// API: Get all unique Drug 1 names
app.get('/api/drugs', async (req, res) => {
    try {
        const sql = `SELECT DISTINCT drug1_name as name FROM interactions ORDER BY name ASC`;
        const rows = await query(sql);
        res.json(rows.map(r => r.name));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch drugs' });
    }
});

// API: Get all unique Drug 2 names
app.get('/api/second-component', async (req, res) => {
    try {
        const sql = `SELECT DISTINCT drug2_name as name FROM interactions ORDER BY name ASC`;
        const rows = await query(sql);
        res.json(rows.map(r => r.name));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch second components' });
    }
});

// API: Find Incompatibilities for a Single Drug
app.get('/api/find-incompatible', async (req, res) => {
    const { drug } = req.query;
    if (!drug) {
        return res.status(400).json({ error: 'Missing drug parameter' });
    }

    try {
        // Query simplified table
        // We look for rows where either drug1 or drug2 matches the query drug
        // AND the result is 'I'
        const sql = `
            SELECT * FROM interactions 
            WHERE (drug1_name = ? OR drug2_name = ?) AND result = 'I'
        `;
        const rows = await query(sql, [drug, drug]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to find incompatibilities' });
    }
});


// API: Check Compatibility for Multiple Items
app.post('/api/check-multi', async (req, res) => {
    const { drugs } = req.body;

    if (!drugs || !Array.isArray(drugs) || drugs.length < 2) {
        return res.status(400).json({ error: 'Please provide at least two drugs/solutions to check.' });
    }

    try {
        const placeholders = drugs.map(() => '?').join(',');
        // For interactions between members of a list:
        // drug1 must be in list AND drug2 must be in list
        const sql = `
            SELECT * FROM interactions 
            WHERE drug1_name IN (${placeholders}) AND drug2_name IN (${placeholders})
        `;
        const params = [...drugs, ...drugs];

        const rows = await query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to check multi compatibility' });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
