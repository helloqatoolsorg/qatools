import "./ProductDescription.css";

export default function ProductDescription({ text }: { text: string }) {
  return <p className="description">{text.split(/(`[^`\r\n]+`)/g).map((part, index) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 2
      ? <code key={index}>{part.slice(1, -1)}</code>
      : part
  )}</p>;
}
