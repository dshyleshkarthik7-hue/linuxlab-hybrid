import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const graph=JSON.parse(await readFile("public/learning-graph.json","utf8")),eco=JSON.parse(await readFile("data/learning/ecosystem.json","utf8"));
const ids=new Set(graph.nodes.map(n=>n.id));
assert.equal(graph.counts.commands,6161);assert.equal(graph.counts.essentialCommands,200);assert.equal(graph.counts.tutorials,520);assert.ok(graph.counts.guidedChallenges>=10);assert.equal(graph.counts.languages,7);assert.equal(graph.counts.dsaTopics,eco.dsaTopics.length);assert.equal(graph.counts.certificationTracks,6);assert.equal(graph.counts.projects,8);assert.equal(graph.counts.careerPathways,4);assert.equal(graph.counts.challengeRoadmapCategories,8);assert.equal(graph.counts.tutorDomains,7);assert.equal(graph.nodes.length,ids.size);
for(const e of graph.edges){assert.ok(ids.has(e.from),"edge source");assert.ok(ids.has(e.to),"edge target");}
assert.equal(graph.nodes.filter(n=>n.type==="command"&&n.tier==="essential").length,200);assert.equal(graph.nodes.filter(n=>n.type==="command"&&n.tier==="reference").length,5961);
assert.ok(graph.nodes.filter(n=>["language","dsa","certification","tutorial-track"].includes(n.type)).every(n=>n.status==="roadmap"));
assert.ok(graph.edges.some(e=>e.relation==="mentions-command"));
const html=await readFile("public/academy/index.html","utf8"),js=await readFile("public/academy/academy.js","utf8"),pkg=JSON.parse(await readFile("package.json","utf8"));
assert.match(html,/Read → Predict → Run → Observe → Explain/);assert.match(js,/textContent/);assert.doesNotMatch(js,/innerHTML\s*=/);assert.match(pkg.scripts.prebuild,/build-learning-graph\.mjs/);assert.match(pkg.scripts.predev,/build-learning-graph\.mjs/);assert.match(pkg.scripts["test:ci"],/test:learning-graph/);
console.log("Learning knowledge graph contract passed.");
