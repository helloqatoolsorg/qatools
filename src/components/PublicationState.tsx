export default function PublicationState({ published }: { published: boolean }) {
  return <span className={"publication-state " + (published ? "published" : "unpublished")}>{published ? "PUBLISHED" : "UNPUBLISHED"}</span>;
}
