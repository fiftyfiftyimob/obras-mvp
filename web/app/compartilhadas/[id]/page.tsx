import SharedWorkDetail from "../../../components/shared-work-detail";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SharedWorkDetail id={Number(id)} />; }
