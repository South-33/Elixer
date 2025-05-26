/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatAI from "../chatAI.js";
import type * as enhancedSearch from "../enhancedSearch.js";
import type * as http from "../http.js";
import type * as integrateDatabases from "../integrateDatabases.js";
import type * as router from "../router.js";
import type * as search from "../search.js";
import type * as updateSearchFunctions from "../updateSearchFunctions.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  chat: typeof chat;
  chatAI: typeof chatAI;
  enhancedSearch: typeof enhancedSearch;
  http: typeof http;
  integrateDatabases: typeof integrateDatabases;
  router: typeof router;
  search: typeof search;
  updateSearchFunctions: typeof updateSearchFunctions;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
