import { Pinecone } from "@pinecone-database/pinecone";

let _client: Pinecone | null = null;

export function getPinecone(): Pinecone {
  if (!_client) {
    _client = new Pinecone({ apiKey: "pcsk_4e5u1M_9hGMgZJTBD3S4baPoh124HmpkBXbQN9CqqMNfXDmZ4v4G1aUKBa3CUyuFfjCy6t"});
  }
  return _client;
}

export function getIndex() {
  const indexName = process.env.PINECONE_INDEX || "outrival";
  return getPinecone().index(indexName);
}
