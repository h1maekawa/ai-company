import Link from "next/link";
import { notFound } from "next/navigation";
import { DEPARTMENT_IDS, DEPARTMENT_NAV_BY_ID, type NavigationDepartmentId } from "@/app/lib/config/navigation";
import { DepartmentPage } from "@/components/mobile-ceo/DepartmentPage";

export default function Page({ params }: { params: { id: string } }) {
  if (!DEPARTMENT_IDS.includes(params.id as NavigationDepartmentId)) notFound();
  const id = params.id as NavigationDepartmentId;
  const navigation = DEPARTMENT_NAV_BY_ID[id];
  return <main className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-5"><Link href="/" className="inline-flex min-h-11 items-center text-sm text-violet-300">← ホーム</Link><h1 className="mb-1 text-2xl font-bold">{navigation.icon} {navigation.label}</h1><p className="mb-5 text-sm text-slate-400">この部門の状況確認・質問・指示</p><DepartmentPage id={id}/></main>;
}
