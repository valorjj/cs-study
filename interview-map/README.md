# interview-map

An interactive CS interview knowledge graph with semantic zoom, built with React and [React Flow](https://reactflow.dev/).

Zoom out to see domains (e.g. OS, Networking, Databases), zoom in to reveal individual concept nodes and their relationships — the visible level of detail adapts to the current zoom level.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
npm test         # run the test suite
```

## Graph data

The graph structure (domains, concepts, and their connections) lives in [`src/graph/graph.json`](./src/graph/graph.json).
