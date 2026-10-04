/**
 * Product Database Repository & Service
 * Canonical Specification: Section 48 of 01_ENGINEERING_SPEC.md & Prompt 24
 *
 * Rules:
 * 1. Multi-tenant isolation: All operations enforce organization_id context.
 * 2. Soft deletion: Product deletion archives the record when references exist.
 * 3. Standard DTO conversions and pagination.
 */

import { ProductRow, ProductVariantRow, ProductStatus } from "./schema/types.js";
import {
  ProductDto,
  ProductVariantDto,
  CreateProductRequest,
  UpdateProductRequest,
  CreateProductVariantRequest,
  UpdateProductVariantRequest,
} from "@platform/contracts";
import {
  TenantContext,
  assertPermission,
} from "@platform/security";
import {
  ProductNotFoundError,
  VariantNotFoundError,
  TenantAccessDeniedError,
} from "@platform/domain";

export interface ProductListFilter {
  status?: ProductStatus;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface ProductRepository {
  createProduct(product: ProductRow): Promise<void>;
  findProductById(organizationId: string, id: string): Promise<ProductRow | null>;
  listProducts(
    organizationId: string,
    filter?: ProductListFilter
  ): Promise<{ items: ProductRow[]; total: number; nextCursor?: string | null }>;
  updateProduct(product: ProductRow): Promise<void>;
  deleteProduct(organizationId: string, id: string): Promise<void>;

  createVariant(variant: ProductVariantRow): Promise<void>;
  findVariantById(organizationId: string, id: string): Promise<ProductVariantRow | null>;
  listVariantsByProduct(organizationId: string, productId: string): Promise<ProductVariantRow[]>;
  updateVariant(variant: ProductVariantRow): Promise<void>;
}

export function toProductVariantDto(row: ProductVariantRow): ProductVariantDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    productId: row.product_id,
    skuId: row.sku_id,
    title: row.title,
    barcode: row.barcode,
    cost: row.cost !== null ? Number(row.cost) : null,
    price: row.price !== null ? Number(row.price) : null,
    weight: row.weight !== null ? Number(row.weight) : null,
    dimensions: row.dimensions || {},
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toProductDto(row: ProductRow, variants?: ProductVariantRow[]): ProductDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    brand: row.brand,
    category: row.category,
    status: row.status,
    externalMetadata: row.external_metadata || {},
    variants: variants ? variants.map(toProductVariantDto) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class InMemoryProductRepository implements ProductRepository {
  private products = new Map<string, ProductRow>();
  private variants = new Map<string, ProductVariantRow>();

  async createProduct(product: ProductRow): Promise<void> {
    this.products.set(product.id, { ...product });
  }

  async findProductById(organizationId: string, id: string): Promise<ProductRow | null> {
    const product = this.products.get(id);
    if (!product || product.organization_id !== organizationId) {
      return null;
    }
    return { ...product };
  }

  async listProducts(
    organizationId: string,
    filter: ProductListFilter = {}
  ): Promise<{ items: ProductRow[]; total: number; nextCursor?: string | null }> {
    let items = Array.from(this.products.values()).filter(
      (p) => p.organization_id === organizationId
    );

    if (filter.status) {
      items = items.filter((p) => p.status === filter.status);
    }
    if (filter.category) {
      items = items.filter((p) => p.category?.toLowerCase() === filter.category?.toLowerCase());
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q)
      );
    }

    // Sort descending by created_at
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = items.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    const paged = items.slice(offset, offset + limit);
    const nextCursor = offset + limit < total ? String(offset + limit) : null;

    return {
      items: paged.map((p) => ({ ...p })),
      total,
      nextCursor,
    };
  }

  async updateProduct(product: ProductRow): Promise<void> {
    this.products.set(product.id, { ...product });
  }

  async deleteProduct(organizationId: string, id: string): Promise<void> {
    const product = await this.findProductById(organizationId, id);
    if (product) {
      // Soft deletion: mark as ARCHIVED
      product.status = "ARCHIVED";
      product.updated_at = new Date().toISOString();
      this.products.set(id, product);
    }
  }

  async createVariant(variant: ProductVariantRow): Promise<void> {
    this.variants.set(variant.id, { ...variant });
  }

  async findVariantById(organizationId: string, id: string): Promise<ProductVariantRow | null> {
    const variant = this.variants.get(id);
    if (!variant || variant.organization_id !== organizationId) {
      return null;
    }
    return { ...variant };
  }

  async listVariantsByProduct(organizationId: string, productId: string): Promise<ProductVariantRow[]> {
    return Array.from(this.variants.values())
      .filter((v) => v.organization_id === organizationId && v.product_id === productId)
      .map((v) => ({ ...v }));
  }

  async updateVariant(variant: ProductVariantRow): Promise<void> {
    this.variants.set(variant.id, { ...variant });
  }

  clear(): void {
    this.products.clear();
    this.variants.clear();
  }
}

export class ProductDatabaseService {
  constructor(private readonly repository: ProductRepository) {}

  async listProducts(
    context: TenantContext,
    filter: ProductListFilter = {}
  ): Promise<{ items: ProductDto[]; total: number; nextCursor?: string | null }> {
    assertPermission(context.role, "products:read");
    const result = await this.repository.listProducts(context.organizationId, filter);
    return {
      items: result.items.map((row) => toProductDto(row)),
      total: result.total,
      nextCursor: result.nextCursor,
    };
  }

  async getProduct(context: TenantContext, productId: string): Promise<ProductDto> {
    assertPermission(context.role, "products:read");
    const row = await this.repository.findProductById(context.organizationId, productId);
    if (!row) {
      throw new ProductNotFoundError(productId);
    }
    const variants = await this.repository.listVariantsByProduct(context.organizationId, productId);
    return toProductDto(row, variants);
  }

  async createProduct(context: TenantContext, data: CreateProductRequest): Promise<ProductDto> {
    assertPermission(context.role, "products:write");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const row: ProductRow = {
      id,
      organization_id: context.organizationId,
      title: data.title,
      description: data.description ?? null,
      brand: data.brand ?? null,
      category: data.category ?? null,
      status: data.status,
      external_metadata: data.externalMetadata || {},
      created_at: now,
      updated_at: now,
    };
    await this.repository.createProduct(row);
    return toProductDto(row, []);
  }

  async updateProduct(
    context: TenantContext,
    productId: string,
    data: UpdateProductRequest
  ): Promise<ProductDto> {
    assertPermission(context.role, "products:write");
    const existing = await this.repository.findProductById(context.organizationId, productId);
    if (!existing) {
      throw new ProductNotFoundError(productId);
    }
    const updated: ProductRow = {
      ...existing,
      title: data.title ?? existing.title,
      description: data.description !== undefined ? data.description : existing.description,
      brand: data.brand !== undefined ? data.brand : existing.brand,
      category: data.category !== undefined ? data.category : existing.category,
      status: data.status ?? existing.status,
      external_metadata: data.externalMetadata
        ? { ...existing.external_metadata, ...data.externalMetadata }
        : existing.external_metadata,
      updated_at: new Date().toISOString(),
    };
    await this.repository.updateProduct(updated);
    const variants = await this.repository.listVariantsByProduct(context.organizationId, productId);
    return toProductDto(updated, variants);
  }

  async deleteProduct(context: TenantContext, productId: string): Promise<void> {
    assertPermission(context.role, "products:write");
    const existing = await this.repository.findProductById(context.organizationId, productId);
    if (!existing) {
      throw new ProductNotFoundError(productId);
    }
    await this.repository.deleteProduct(context.organizationId, productId);
  }

  async listVariants(context: TenantContext, productId: string): Promise<ProductVariantDto[]> {
    assertPermission(context.role, "products:read");
    const product = await this.repository.findProductById(context.organizationId, productId);
    if (!product) {
      throw new ProductNotFoundError(productId);
    }
    const rows = await this.repository.listVariantsByProduct(context.organizationId, productId);
    return rows.map(toProductVariantDto);
  }

  async createVariant(
    context: TenantContext,
    productId: string,
    data: CreateProductVariantRequest
  ): Promise<ProductVariantDto> {
    assertPermission(context.role, "products:write");
    const product = await this.repository.findProductById(context.organizationId, productId);
    if (!product) {
      throw new ProductNotFoundError(productId);
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const row: ProductVariantRow = {
      id,
      organization_id: context.organizationId,
      product_id: productId,
      sku_id: data.skuId,
      title: data.title,
      barcode: data.barcode ?? null,
      cost: data.cost ?? null,
      price: data.price ?? null,
      weight: data.weight ?? null,
      dimensions: data.dimensions || {},
      status: data.status,
      created_at: now,
      updated_at: now,
    };
    await this.repository.createVariant(row);
    return toProductVariantDto(row);
  }

  async updateVariant(
    context: TenantContext,
    variantId: string,
    data: UpdateProductVariantRequest
  ): Promise<ProductVariantDto> {
    assertPermission(context.role, "products:write");
    const existing = await this.repository.findVariantById(context.organizationId, variantId);
    if (!existing) {
      throw new VariantNotFoundError(variantId);
    }
    const updated: ProductVariantRow = {
      ...existing,
      title: data.title ?? existing.title,
      barcode: data.barcode !== undefined ? data.barcode : existing.barcode,
      cost: data.cost !== undefined ? data.cost : existing.cost,
      price: data.price !== undefined ? data.price : existing.price,
      weight: data.weight !== undefined ? data.weight : existing.weight,
      dimensions: data.dimensions ? { ...existing.dimensions, ...data.dimensions } : existing.dimensions,
      status: data.status ?? existing.status,
      updated_at: new Date().toISOString(),
    };
    await this.repository.updateVariant(updated);
    return toProductVariantDto(updated);
  }
}
