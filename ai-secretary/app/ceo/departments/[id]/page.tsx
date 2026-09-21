import { notFound } from "next/navigation";
import { DEPARTMENT_IDS, type DepartmentId } from "@/app/lib/mobile-ceo/departments";
import { DepartmentPage } from "@/components/mobile-ceo/DepartmentPage";
export default function Page({ params }: { params: { id: string } }) { if (!DEPARTMENT_IDS.includes(params.id as DepartmentId)) notFound(); return <main className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-5"><a href="/ceo" className="inline-flex min-h-11 items-center text-sm text-violet-300">← CEO Home</a><h1 className="mb-4 text-2xl font-bold">Department Control</h1><DepartmentPage id={params.id as DepartmentId}/></main>; }
