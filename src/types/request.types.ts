import { Request } from 'express';

export type TypedRequest<
  TQuery = Record<string, any>,
  TBody = Record<string, any>,
  TParams = Record<string, any>
> = Request<TParams, any, TBody, TQuery>;

export type TypedRequestQuery<TQuery> = Request<Record<string, any>, any, any, TQuery>;

export type TypedRequestBody<TBody, TParams = Record<string, any>> = Request<TParams, any, TBody, any>;

export type TypedRequestParams<TParams> = Request<TParams, any, any, any>;
