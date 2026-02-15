import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import { FlagEmbedding, EmbeddingModel } from 'fastembed';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app: any = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const QDRANT_URL = process.env.QDRANT_URL;
const QDRANT_API = process.env.QDRANT_API;

if (!QDRANT_URL || !QDRANT_API) {
    throw new Error('Missing QDRANT_URL or QDRANT_API in environment');
}

const client = new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API,
});

async function ensureCategoryIndex() {
    await client.createPayloadIndex('summarisation', {
        field_name: 'category',
        field_schema: 'keyword',
    }).catch(() => { });
}

ensureCategoryIndex();

let model: any = null;

async function getEmbeddingModel() {
    if (!model) {
        model = await FlagEmbedding.init({
            model: EmbeddingModel.BGESmallENV15,
        });
    }
    return model;
}

function toCollectionName(category: string) {
    const normalized = category
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return normalized.length > 0 ? normalized.slice(0, 63) : "unknown";
}

app.get('/query', async (req: any, res: any) => {
    const query = (req.query.q as string) || (req.body?.query as string);

    if (!query) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    try {
        const embeddingModel = await getEmbeddingModel();
        const queryVector = await (embeddingModel as any).queryEmbed(query);

        console.log(`Searching for the most similar summary for query: "${query}"`);

        // 1. Find the top summary to get the category
        const summaryResults: any = await (client as any).query('summarisation', {
            query: Array.from(queryVector) as number[],
            limit: 1,
            with_payload: true,
        });

        if (!summaryResults.points || summaryResults.points.length === 0) {
            return res.status(404).json({ error: 'No matching summaries found' });
        }

        const topResult = summaryResults.points[0];
        const category = topResult.payload?.category;
        const topSummary = topResult.payload?.summary;

        if (!category || typeof category !== 'string') {
            return res.status(500).json({ error: 'Top summary is missing category payload' });
        }

        console.log(`Top summary similarity found: "${topResult}" in category: "${category}"`);

        // 2. Retrieve top 5 similar papers from the selected category namespace
        const collection = toCollectionName(category);

        const relatedResults: any = await (client as any).query(collection, {
            query: Array.from(queryVector) as number[],
            limit: 5,
            with_payload: true,
        });

        const relatedPapers = (relatedResults.points || []).map((p: any) => ({
            id: p.payload?.id,
            title: p.payload?.title,
            abstract: p.payload?.abstract,
            category: p.payload?.category,
            score: p.score,
        }));

        res.json({
            query,
            match: {
                summary: topSummary,
                category: category,
                score: topResult.score
            },
            related_papers: relatedPapers
        });

    } catch (error: any) {
        console.error('Error processing query:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
