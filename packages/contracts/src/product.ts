/**
 * Product & Variant API Contracts
 * Canonical Specification: Section 48 of 01_ENGINEERING_SPEC.md & Prompt 24
 */

import { z } from "zod";
import { PaginationParamsSchema } from "./api.js";

export const ProductStatusSchema = z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const ProductVariantDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  productId: z.string().uuid(),
  skuId: z.string().uuid(),
  title: z.string(),
  barcode: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  price: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  dimensions: z.record(z.unknown()).default({}),
  status: ProductStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProductVariantDto = z.infer<typeof ProductVariantDtoSchema>;

export const ProductDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: ProductStatusSchema,
  externalMetadata: z.record(z.unknown()).default({}),
  variants: z.array(ProductVariantDtoSchema).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProductDto = z.infer<typeof ProductDtoSchema>;

export const CreateProductRequestSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  status: ProductStatusSchema.default("ACTIVE"),
  externalMetadata: z.record(z.unknown()).optional(),
});

export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  status: ProductStatusSchema.optional(),
  externalMetadata: z.record(z.unknown()).optional(),
});

export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const CreateProductVariantRequestSchema = z.object({
  skuId: z.string().uuid(),
  title: z.string().min(1, "Variant title is required"),
  barcode: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  weight: z.number().nonnegative().optional(),
  dimensions: z.record(z.unknown()).optional(),
  status: ProductStatusSchema.default("ACTIVE"),
});

export type CreateProductVariantRequest = z.infer<typeof CreateProductVariantRequestSchema>;

export const UpdateProductVariantRequestSchema = z.object({
  title: z.string().min(1).optional(),
  barcode: z.string().nullable().optional(),
  cost: z.number().nonnegative().nullable().optional(),
  price: z.number().nonnegative().nullable().optional(),
  weight: z.number().nonnegative().nullable().optional(),
  dimensions: z.record(z.unknown()).optional(),
  status: ProductStatusSchema.optional(),
});

export type UpdateProductVariantRequest = z.infer<typeof UpdateProductVariantRequestSchema>;

export const ProductQuerySchema = PaginationParamsSchema.extend({
  status: ProductStatusSchema.optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});

export type ProductQuery = z.infer<typeof ProductQuerySchema>;
