import { Material } from "../types";

/**
 * Content Source Provider — Note/X Studioへ発信材料を供給するアダプタ。
 * Timeboxはこのインターフェースを実装する「1つ」の実装に過ぎない。
 * isAvailable()がfalseでもlistMaterials()は例外を投げず空配列を返すこと（Missing Provider fallback）。
 */
export interface ContentSourceProvider {
  id: string;
  label: string;
  isAvailable(): Promise<boolean>;
  listMaterials(): Promise<Material[]>;
  getMaterial(id: string): Promise<Material | null>;
  /** 由来元から取り込み、Content CoreのMaterialとして永続化する */
  importMaterial(id: string): Promise<Material>;
}
