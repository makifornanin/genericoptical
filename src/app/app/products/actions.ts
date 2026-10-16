"use server";

import { refresh } from "next/cache";
import { CsvError, parseCsvRecords } from "@/lib/csv";
import type { ProductInput } from "@/lib/schemas";
import { runAction } from "@/server/actions";
import * as catalog from "@/server/services/catalog";
import { invalid } from "@/server/services/core";
import { revalidateWebsiteAfter } from "@/server/website-revalidate";

export async function saveProductAction(id: string | null, input: ProductInput, opening: catalog.OpeningStock = []) {
  return runAction(async (ctx) => {
    if (id) {
      await catalog.updateProduct(ctx, id, input);
      refresh();
      revalidateWebsiteAfter("catalog", "site");
      return { productId: id };
    }
    const res = await catalog.createProduct(ctx, input, opening);
    refresh();
    revalidateWebsiteAfter("catalog", "site");
    return { productId: res!.productId };
  }, id ? "Product saved" : "Product created");
}

export async function archiveProductAction(id: string, archived: boolean) {
  return runAction(async (ctx) => {
    await catalog.setProductArchived(ctx, id, archived);
    refresh();
    revalidateWebsiteAfter("catalog", "site");
    return { id };
  }, archived ? "Product archived" : "Product restored");
}

export async function createCategoryAction(name: string, kind: string) {
  return runAction(async (ctx) => {
    const c = await catalog.createCategory(ctx, { name, kind });
    refresh();
    return { id: c!.id, name: c!.name };
  }, "Category added");
}

export async function importProductsAction(csvText: string) {
  return runAction(async (ctx) => {
    if (csvText.length > 2_000_000) throw invalid("The file is too large (2 MB max).");
    let records: Record<string, string>[];
    try {
      records = parseCsvRecords(csvText);
    } catch (error) {
      if (error instanceof CsvError) throw invalid(error.message);
      throw error;
    }
    const res = await catalog.importProducts(ctx, records);
    refresh();
    revalidateWebsiteAfter("catalog", "site");
    return res;
  });
}
