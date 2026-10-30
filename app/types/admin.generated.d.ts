/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type ReadinessCollectionsQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type ReadinessCollectionsQuery = { collections: { nodes: Array<(
      Pick<AdminTypes.Collection, 'id' | 'title' | 'handle'>
      & { productsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>> }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'> } };

export type InventoryLocationsQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type InventoryLocationsQuery = { locations: { nodes: Array<Pick<AdminTypes.Location, 'id' | 'name'>>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'> } };

export type InventoryVariantsQueryVariables = AdminTypes.Exact<{
  first?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  last?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  before?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  levelsFirst: AdminTypes.Scalars['Int']['input'];
}>;


export type InventoryVariantsQuery = { productVariants: { nodes: Array<(
      Pick<AdminTypes.ProductVariant, 'id' | 'title'>
      & { product: Pick<AdminTypes.Product, 'id' | 'title'>, inventoryItem: (
        Pick<AdminTypes.InventoryItem, 'id' | 'tracked'>
        & { inventoryLevels: { nodes: Array<{ location: Pick<AdminTypes.Location, 'id' | 'name'>, quantities: Array<Pick<AdminTypes.InventoryQuantity, 'name' | 'quantity'>> }> } }
      ) }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'> } };

export type ShopTimezoneQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ShopTimezoneQuery = { shop: Pick<AdminTypes.Shop, 'ianaTimezone'> };

export type OrderCountsQueryVariables = AdminTypes.Exact<{
  today: AdminTypes.Scalars['String']['input'];
  unfulfilled: AdminTypes.Scalars['String']['input'];
}>;


export type OrderCountsQuery = { today?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, unfulfilled?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>> };

export type RecentOrdersQueryVariables = AdminTypes.Exact<{
  first?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  last?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  before?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  lineItemsFirst: AdminTypes.Scalars['Int']['input'];
}>;


export type RecentOrdersQuery = { orders: { nodes: Array<(
      Pick<AdminTypes.Order, 'id' | 'name' | 'createdAt' | 'cancelledAt' | 'displayFinancialStatus' | 'displayFulfillmentStatus' | 'tags'>
      & { currentTotalPriceSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount' | 'currencyCode'> }, lineItems: { nodes: Array<(
          Pick<AdminTypes.LineItem, 'title' | 'quantity'>
          & { variant?: AdminTypes.Maybe<Pick<AdminTypes.ProductVariant, 'id'>>, product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id'>> }
        )> } }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'> } };

export type StoreProductCountsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type StoreProductCountsQuery = { all?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, active?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, draft?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, archived?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>> };

export type ProductHealthListQueryVariables = AdminTypes.Exact<{
  first?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  last?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  before?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  variantsFirst: AdminTypes.Scalars['Int']['input'];
}>;


export type ProductHealthListQuery = { products: { nodes: Array<(
      Pick<AdminTypes.Product, 'id' | 'title' | 'handle' | 'status' | 'description' | 'onlineStoreUrl'>
      & { seo: Pick<AdminTypes.Seo, 'title' | 'description'>, options: Array<Pick<AdminTypes.ProductOption, 'name' | 'values'>>, mediaCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, featuredMedia?: AdminTypes.Maybe<{ preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>> }> }>, variantsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, collections: { nodes: Array<Pick<AdminTypes.Collection, 'id'>> }, variants: { nodes: Array<(
          Pick<AdminTypes.ProductVariant, 'title' | 'price' | 'inventoryQuantity'>
          & { inventoryItem: Pick<AdminTypes.InventoryItem, 'id' | 'tracked'> }
        )> } }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'> } };

export type ProductHealthDetailQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  variantsFirst: AdminTypes.Scalars['Int']['input'];
}>;


export type ProductHealthDetailQuery = { product?: AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'handle' | 'status' | 'description' | 'onlineStoreUrl'>
    & { seo: Pick<AdminTypes.Seo, 'title' | 'description'>, options: Array<Pick<AdminTypes.ProductOption, 'name' | 'values'>>, mediaCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, featuredMedia?: AdminTypes.Maybe<{ preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>> }> }>, variantsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, collections: { nodes: Array<Pick<AdminTypes.Collection, 'id'>> }, variants: { nodes: Array<(
        Pick<AdminTypes.ProductVariant, 'title' | 'price' | 'inventoryQuantity'>
        & { inventoryItem: Pick<AdminTypes.InventoryItem, 'id' | 'tracked'> }
      )> } }
  )> };

interface GeneratedQueryTypes {
  "#graphql\n  query ReadinessCollections($first: Int!, $after: String) {\n    collections(first: $first, after: $after, sortKey: TITLE) {\n      nodes {\n        id\n        title\n        handle\n        productsCount { count }\n      }\n      pageInfo { hasNextPage endCursor }\n    }\n  }\n": {return: ReadinessCollectionsQuery, variables: ReadinessCollectionsQueryVariables},
  "#graphql\n  query InventoryLocations($first: Int!, $after: String) {\n    locations(first: $first, after: $after, sortKey: NAME) {\n      nodes { id name }\n      pageInfo { hasNextPage endCursor }\n    }\n  }\n": {return: InventoryLocationsQuery, variables: InventoryLocationsQueryVariables},
  "#graphql\n  query InventoryVariants(\n    $first: Int\n    $after: String\n    $last: Int\n    $before: String\n    $query: String\n    $levelsFirst: Int!\n  ) {\n    productVariants(\n      first: $first\n      after: $after\n      last: $last\n      before: $before\n      query: $query\n      sortKey: INVENTORY_QUANTITY\n    ) {\n      nodes {\n        id\n        title\n        product { id title }\n        inventoryItem {\n          id\n          tracked\n          inventoryLevels(first: $levelsFirst) {\n            nodes {\n              location { id name }\n              quantities(names: [\"available\"]) { name quantity }\n            }\n          }\n        }\n      }\n      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n    }\n  }\n": {return: InventoryVariantsQuery, variables: InventoryVariantsQueryVariables},
  "#graphql\n  query ShopTimezone {\n    shop { ianaTimezone }\n  }\n": {return: ShopTimezoneQuery, variables: ShopTimezoneQueryVariables},
  "#graphql\n  query OrderCounts($today: String!, $unfulfilled: String!) {\n    today: ordersCount(query: $today, limit: null) { count precision }\n    unfulfilled: ordersCount(query: $unfulfilled, limit: null) { count precision }\n  }\n": {return: OrderCountsQuery, variables: OrderCountsQueryVariables},
  "#graphql\n  query RecentOrders(\n    $first: Int\n    $after: String\n    $last: Int\n    $before: String\n    $query: String\n    $lineItemsFirst: Int!\n  ) {\n    orders(\n      first: $first\n      after: $after\n      last: $last\n      before: $before\n      query: $query\n      sortKey: CREATED_AT\n      reverse: true\n    ) {\n      nodes {\n        id\n        name\n        createdAt\n        cancelledAt\n        displayFinancialStatus\n        displayFulfillmentStatus\n        tags\n        currentTotalPriceSet { shopMoney { amount currencyCode } }\n        lineItems(first: $lineItemsFirst) {\n          nodes {\n            title\n            quantity\n            variant { id }\n            product { id }\n          }\n        }\n      }\n      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n    }\n  }\n": {return: RecentOrdersQuery, variables: RecentOrdersQueryVariables},
  "#graphql\n  query StoreProductCounts {\n    all: productsCount(limit: null) { count precision }\n    active: productsCount(query: \"status:active\", limit: null) { count precision }\n    draft: productsCount(query: \"status:draft\", limit: null) { count precision }\n    archived: productsCount(query: \"status:archived\", limit: null) { count precision }\n  }\n": {return: StoreProductCountsQuery, variables: StoreProductCountsQueryVariables},
  "#graphql\n  query ProductHealthList(\n    $first: Int\n    $after: String\n    $last: Int\n    $before: String\n    $query: String\n    $variantsFirst: Int!\n  ) {\n    products(\n      first: $first\n      after: $after\n      last: $last\n      before: $before\n      query: $query\n      sortKey: TITLE\n    ) {\n      nodes {\n        id\n        title\n        handle\n        status\n        description\n        onlineStoreUrl\n        seo { title description }\n        options { name values }\n        mediaCount { count }\n        featuredMedia { preview { image { url altText } } }\n        variantsCount { count }\n        collections(first: 1) { nodes { id } }\n        variants(first: $variantsFirst) {\n          nodes {\n            title\n            price\n            inventoryQuantity\n            inventoryItem { id tracked }\n          }\n        }\n      }\n      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n    }\n  }\n": {return: ProductHealthListQuery, variables: ProductHealthListQueryVariables},
  "#graphql\n  query ProductHealthDetail($id: ID!, $variantsFirst: Int!) {\n    product(id: $id) {\n      id\n      title\n      handle\n      status\n      description\n      onlineStoreUrl\n      seo { title description }\n      options { name values }\n      mediaCount { count }\n      featuredMedia { preview { image { url altText } } }\n      variantsCount { count }\n      collections(first: 1) { nodes { id } }\n      variants(first: $variantsFirst) {\n        nodes {\n          title\n          price\n          inventoryQuantity\n          inventoryItem { id tracked }\n        }\n      }\n    }\n  }\n": {return: ProductHealthDetailQuery, variables: ProductHealthDetailQueryVariables},
}

interface GeneratedMutationTypes {
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
