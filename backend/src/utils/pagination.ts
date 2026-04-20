import type { Response } from 'express';

type PaginationConfig = {
  defaultLimit?: number;
  maxLimit?: number;
};

type PaginationQuery = {
  page?: unknown;
  limit?: unknown;
};

export const parsePaginationQuery = (
  query: PaginationQuery,
  config: PaginationConfig = {},
) => {
  const defaultLimit = Number(config.defaultLimit ?? 50);
  const maxLimit = Number(config.maxLimit ?? 100);

  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.trunc(rawLimit), maxLimit)
    : defaultLimit;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const setPaginationHeaders = (
  res: Response,
  params: {
    page: number;
    limit: number;
    total: number;
  },
) => {
  const { page, limit, total } = params;
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));

  res.setHeader('X-Page', String(page));
  res.setHeader('X-Limit', String(limit));
  res.setHeader('X-Total-Count', String(total));
  res.setHeader('X-Total-Pages', String(totalPages));
  res.setHeader('X-Has-More', String(page < totalPages));
};
