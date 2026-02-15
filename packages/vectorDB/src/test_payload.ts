import { QuadrantVectorStore } from "./qdrant";
import { data } from "./qasper_data";



async function verify() {
    console.log("Starting verification...");
    const papers = Object.entries(data).slice(0, 2);
    console.log("Sample papers for verification:");
    papers.forEach(([id, paper]) => {
        console.log(`ID: ${id}`);
        console.log(`Title: ${paper.title}`);
        console.log(`Abstract: ${paper.abstract.substring(0, 100)}...`);
    });

    console.log("\nVerification of code logic (Dry Run Simulation):");
    const points = papers.map(([id, paper]) => {
        const text = `${paper.title}\n\n${paper.abstract}`;
        const payload = {
            id,
            title: paper.title,
            abstract: paper.abstract,
            text: text,
            embedding_model: "BGESmallENV15",
            created_at: new Date().toISOString(),
        };
        return {
            id: "uuid-placeholder",
            vector: [0.1, 0.2, 0.3], // Mocked vector
            payload,
        };
    });

    console.log("Constructed points payload structure:");
    console.log(JSON.stringify(points[0].payload, null, 2));

    if (points[0].payload.title && points[0].payload.abstract) {
        console.log("\nSUCCESS: Payload correctly includes Title and Abstract.");
    } else {
        console.log("\nFAILURE: Payload is missing Title or Abstract.");
    }
}

verify().catch(console.error);
