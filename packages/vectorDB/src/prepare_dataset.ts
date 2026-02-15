import { FlagEmbedding, EmbeddingModel } from "fastembed";
import { data } from "./qasper_data";
import * as fs from "fs";
import * as path from "path";

// 1. Select 10 diverse anchors
const anchorIds = [
    "1912.01214",
    "1810.08699",
    "1609.00425",
    "1801.05147",
    "1811.00383",
    "1909.09067",
    "1704.06194",
    "1909.00512",
    "2003.03106",
    "1708.01464",
];
const categories = [ 
  "MachineTranslation",
  "NamedEntityRecognition",
  "ComputationalSocialScience",
  "InformationExtraction",
  "MultilingualMachineTranslation",
  "ReadabilityAssessment",
  "KnowledgeBaseQuestionAnswering",
  "RepresentationLearning",
  "ClinicalNLP",
  "SpeechProcessing"]

async function prepareDataset() {
    console.log("Initializing embedding model...");
    const model = await FlagEmbedding.init({
        model: EmbeddingModel.BGESmallENV15,
    });

    // 2. Select 200 papers (including anchors + next 190)
    const allIds = Object.keys(data);
    const selectedIds = new Set<string>(anchorIds);
    let i = 0;
    while (selectedIds.size < 200 && i < allIds.length) {
        selectedIds.add(allIds[i]);
        i++;
    }

    const papers = Array.from(selectedIds).map(id => ({
        id,
        title: (data as any)[id].title,
        abstract: (data as any)[id].abstract,
        content: `${(data as any)[id].title}. ${(data as any)[id].abstract}`
    }));

    console.log(`Generating embeddings for ${papers.length} papers...`);
    const paperEmbeddings: { id: string; embedding: number[] }[] = [];
    for (const paper of papers) {
        const embedding = await model.queryEmbed(paper.abstract);
        paperEmbeddings.push({
            id: paper.id,
            embedding: Array.from(embedding)
        });
    }

    // 3. Category Anchors

 
    const categoryAnchors = anchorIds.map((id, index) => {
        const paper = (data as any)[id];
        return {
            id: categories[index],  // Use the map index instead
            title: paper.title,
            name: paper.title.split(":")[0].substring(0, 50),
            embedding: paperEmbeddings.find(e => e.id === id)!.embedding
        };
    });

    console.log("Clustering papers...");

    function cosineSimilarity(a: number[], b: number[]) {
        let dotProduct = 0;
        let mA = 0;
        let mB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            mA += a[i] * a[i];
            mB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
    }

 
    const assignments: { paperId: string, categoryId: string, similarity: number }[] = [];

    for (const paper of paperEmbeddings) {
        for (const anchor of categoryAnchors) {
            const similarity = cosineSimilarity(paper.embedding, anchor.embedding);
            assignments.push({
                paperId: paper.id,
                categoryId: anchor.id,
                similarity
            });
        }
    }

    const result: any = {};
    const usedPaperIds = new Set<string>();

    for (const anchor of categoryAnchors) {
        const sortedForCategory = assignments
            .filter(a => a.categoryId === anchor.id)
            .sort((a, b) => b.similarity - a.similarity);

        const top20 = [];
        for (const item of sortedForCategory) {
            if (!usedPaperIds.has(item.paperId)) {
                top20.push(item);
                usedPaperIds.add(item.paperId);
            }
            if (top20.length === 20) break;
        }

        result[anchor.id] = top20.map(item => ({
            id: item.paperId,
            title: (data as any)[item.paperId].title,
            similarity: item.similarity
        }));
    }

    const outputPath = path.join(__dirname, "clustered_dataset.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`Dataset prepared and saved to ${outputPath}`);
    console.log("Summary of clusters:");
    for (const cat in result) {
        console.log(`- ${cat}: ${result[cat].length} papers`);
    }
}

prepareDataset().catch(console.error);
