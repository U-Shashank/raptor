import { QdrantClient } from '@qdrant/js-client-rest';
import { FlagEmbedding, EmbeddingModel } from 'fastembed';
import { v4 as uuidv4 } from "uuid";
import { data } from "./qasper_data"

import dotenv from "dotenv"
dotenv.config()

let _client: QdrantClient | null = null;

export function getClient(): QdrantClient {
  if (!_client) {
    _client = new QdrantClient({
      url: `${process.env.QDRANT_URL}`,
      apiKey: `${process.env.QDRANT_API}`,
    });
  }
  return _client;
}


export let model: any = null;

export async function getEmbeddingModel() {
  if (!model) {
    model = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15,
    });
  }
  return model;
}

export async function QuadrantVectorStore(
  collection: "QASPER" = "QASPER") {
  const client = getClient();
  await client.createCollection(collection, {
    vectors: {
      size: 384,
      distance: "Cosine",
    },
  }).catch(() => { });

  if (!model) {
    model = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15,
    });
  }

  const papers = Object.entries(data);
  const messages = papers.map(([id, paper]) => `${paper.title}\n\n${paper.abstract}`);
  const embeddings: number[][] = [];

  for await (const batch of model.embed(messages, 64)) {
    embeddings.push(...batch);
  }

  console.log("First embedding size:", embeddings[0]?.length);
  console.log("Papers count:", papers.length);
  console.log("Embeddings count:", embeddings.length);

  if (embeddings.length !== papers.length) {
    throw new Error("Embedding count mismatch with papers");
  }

  const points = embeddings.map((vector, index) => {
    const [id, paper] = papers[index];
    const payload: any = {
      id,
      title: paper.title,
      abstract: paper.abstract,
      text: messages[index],
      embedding_model: "BGESmallENV15",
      created_at: new Date().toISOString(),
    };

    return {
      id: uuidv4(),
      vector: Array.from(vector),
      payload,
    };
  });

  await client.upsert(collection, {
    wait: true,
    points,
  });
}

export async function QuadrantVectorquery(collection: string, query: string) {
  if (!model) {
    model = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15,
    });
  }

  const embeddingGenerator = model.embed([query]);
  const embeddingResult = await embeddingGenerator.next();

  if (!embeddingResult.value || !Array.isArray(embeddingResult.value) || embeddingResult.value.length === 0) {
    throw new Error("Failed to generate query embedding");
  }

  const rawVector = embeddingResult.value[0];
  const vector: number[] = Array.isArray(rawVector)
    ? rawVector.map(v => Number(v))
    : Array.from(rawVector).map(v => Number(v));

  if (vector.some(v => isNaN(v) || !isFinite(v))) {
    throw new Error("Query embedding contains invalid values");
  }

  console.log("Query embedding size:", vector.length);
  console.log("Query embedding sample:", vector.slice(0, 5));

  const client = getClient();
  const results = await client.query(collection, {
    query: vector,
    with_payload: true,
    limit: 20,
  });

  return results.points;
}

export async function listCollections() {
  const client = getClient();
  const res = await client.getCollections();
  return res.collections;
}

