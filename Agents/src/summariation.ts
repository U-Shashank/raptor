import ollama from 'ollama'
import { getClient, getEmbeddingModel } from "../../packages/vectorDB/src/qdrant"
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { data } from "../../packages/vectorDB/src/qasper_data"
import dotenv from 'dotenv'
dotenv.config()

export async function summarisation(message: string, details: string) {
  const response = await ollama.chat({
    model: 'gemma3:1b',
    messages: [{
      role: 'user', content: `
        Instructions:
        - Mark as UNUSUAL only if the message describes that a event was cancelled.
  
        Message:${message}
        details:${details} 
        - Output: 
       Return ONLY one label from this set: NORMAL, UNUSUAL— no explanations, no extra text.
  `}],
  })

  console.log(response.message.content)
  return response.message.content
}

function toCollectionName(category: string) {
  const normalized = category
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized.length > 0 ? normalized.slice(0, 63) : "unknown";
}

export async function ingestClustersToCategoryNamespaces() {
  const possiblePaths = [
    path.join(__dirname, "./clustered_dataset.json"),
    path.join(__dirname, "../dist/Agents/src/clustered_dataset.json"),
    path.join(process.cwd(), "Agents/src/clustered_dataset.json"),
    path.join(process.cwd(), "packages/vectorDB/src/clustered_dataset.json")
  ];

  let clusteredDatasetPath = "";
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      clusteredDatasetPath = p;
      break;
    }
  }

  if (!clusteredDatasetPath) {
    throw new Error("Could not find clustered_dataset.json in any expected location.");
  }

  console.log(`Using dataset from: ${clusteredDatasetPath}`);
  const raw = fs.readFileSync(clusteredDatasetPath, "utf-8");
  const clusters = JSON.parse(raw) as Record<string, { id: string; title: string; similarity: number }[]>;
  const embeddingModel = await getEmbeddingModel();
  const client = getClient();

  const summaryRecords: { title: string; category: string }[] = [];

  for (const [category, papers] of Object.entries(clusters)) {
    const collection = toCollectionName(category);

    console.log(`Clearing and preparing collection: ${collection}`);
    await client.deleteCollection(collection).catch(() => { });
    await client.createCollection(collection, {
      vectors: { size: 384, distance: "Cosine" }
    });

    const messages = papers.map(p => {
      const paper = (data as any)[p.id];
      const title = paper?.title ?? p.title;
      const abstract = paper?.abstract ?? "";
      return `${title}\n\n${abstract}`;
    });

    const embeddings: number[][] = [];
    for await (const batch of (embeddingModel as any).embed(messages, 64)) {
      embeddings.push(...batch);
    }

    const points = papers.map((p, idx) => {
      const paper = (data as any)[p.id];
      const title = paper?.title ?? p.title;
      const abstract = paper?.abstract ?? "";
      const text = messages[idx];

      summaryRecords.push({ title, category });

      return {
        id: crypto.randomUUID(),
        vector: Array.from(embeddings[idx]) as number[],
        payload: {
          id: p.id,
          title,
          abstract,
          text,
          category,
          cluster_similarity: p.similarity,
          created_at: new Date().toISOString(),
        }
      };
    });

    await client.upsert(collection, {
      wait: true,
      points
    });
  }

  return summarizeAndStoreTitles(summaryRecords);
}

export async function summarizeAndStoreTitles(records: { title: string, category: string }[]) {
  const titlesByCategory = new Map<string, string[]>();
  for (const r of records) {
    const current = titlesByCategory.get(r.category) ?? [];
    current.push(r.title);
    titlesByCategory.set(r.category, current);
  }

  const model = await getEmbeddingModel();
  const client = getClient();

  console.log("Recreating Qdrant collection 'summarisation'...");
  await client.deleteCollection("summarisation").catch(() => { });
  await client.createCollection("summarisation", {
    vectors: { size: 384, distance: "Cosine" }
  });

  const points: any[] = [];
  const output: { summaries: { category: string; summary: string }[] } = { summaries: [] };

  for (const [category, titles] of titlesByCategory.entries()) {
    const titlesString = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');

    const prompt = `
      Instructions:
      1. You are an expert research assistant.
      2. Summarize the following paper titles into 4-6 concise sentences.
      3. Focus on common themes and research directions.
      4. Output MUST be valid JSON with exactly two fields: "category" and "summary".
      5. "category" should be exactly: "${category}"
      6. Do not include any other text, markdown blocks, or explanations.

      Titles:
      ${titlesString}

      Expected JSON Format:
      {
        "category": "${category}",
        "summary": "Your 4-6 sentence summary here."
      }
    `;

    console.log(`Requesting category summary from LLM for category: ${category}`);
    try {
      const response = await ollama.chat({
        model: 'gemma3:1b',
        messages: [{ role: 'user', content: prompt }],
        format: 'json'
      });

      console.log(`Raw LLM response for ${category}:`, response.message.content);

      let categoryOutput: any;
      try {
        categoryOutput = JSON.parse(response.message.content);
      } catch (e) {
        console.error(`Failed to parse LLM response as JSON for category ${category}. Raw content:`, response.message.content);
        continue;
      }

      const summary: string = categoryOutput.summary;
      if (!summary) {
        console.error(`No summary found in LLM response for category ${category}`);
        continue;
      }

      const embedding = await model.queryEmbed(summary);

      points.push({
        id: crypto.randomUUID(),
        vector: Array.from(embedding) as number[],
        payload: {
          category,
          summary,
          created_at: new Date().toISOString(),
        }
      });

      output.summaries.push({ category, summary });
    } catch (err) {
      console.error(`Error summarizing category ${category}:`, err);
      // Continue to next category
    }
  }

  console.log(`Upserting ${points.length} points into Qdrant "summarisation" collection...`);
  await client.upsert("summarisation", {
    wait: true,
    points
  });

  console.log("Summarization and storage complete.");
  return output;
}

// CLI entrypoint
if (require.main === module) {
  (async () => {
    try {
      console.log("Starting ingestion...");
      await ingestClustersToCategoryNamespaces();
      console.log("Ingestion completed successfully.");
    } catch (error) {
      console.error("Ingestion failed:", error);
      process.exit(1);
    }
  })();
}
