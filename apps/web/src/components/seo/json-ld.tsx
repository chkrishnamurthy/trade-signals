export function JsonLd({ schema }: { schema: Record<string, unknown> | object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: structured data is server serialized object, not user HTML
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
