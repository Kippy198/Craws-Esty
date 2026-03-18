const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

const DATA_DIR = path.join(__dirname,"data");

async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        console.error("Create folder error: ", error);
    }
}

function normalize(p) {
    if(!p || !p.name || !p.link) return null;

    return {
        name: p.name.trim(),
        link: p.link, 
        img : p.img || "",
        source: "etsy",
        createdAt: new Date().toISOString()
    };
}

app.post("/products", async(req,res) => {
    try {
        const raw = req.body;
        if(!Array.isArray(raw)) {
            return res.status(400).json({error: "Data must be array"});
        }

        const cleaned = raw
                        .map(normalize)
                        .filter(Boolean);
        if(cleaned.length === 0) {
            return res.status(400).json({ error : "No valid data"});
        }
        const fileName = `products-${Date.now()}.json`;
        const filePath = path.join(DATA_DIR,fileName);

        await fs.writeFile(filePath, JSON.stringify(cleaned, null ,2));
        console.log(`Saved ${cleaned.length} products -> ${fileName}`);
        res.json({
            message: "Saved",
            count: cleaned.length
        });
    } catch (err) {
        console.error("Server error: ", err);
        res.status(500).json({error: err.message});
    }
});

const PORT = 3000;

app.listen(PORT, async () => {
    await ensureDataDir();
    console.log(`Server running at http://localhost:${PORT}`);
})