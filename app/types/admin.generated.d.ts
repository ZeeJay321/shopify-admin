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
  sortKey?: AdminTypes.InputMaybe<AdminTypes.ProductVariantSortKeys>;
  reverse?: AdminTypes.InputMaybe<AdminTypes.Scalars['Boolean']['input']>;
}>;


export type InventoryVariantsQuery = { productVariants: { nodes: Array<(
      Pick<AdminTypes.ProductVariant, 'id' | 'title'>
      & { product: Pick<AdminTypes.Product, 'id' | 'title'>, inventoryItem: (
        Pick<AdminTypes.InventoryItem, 'id' | 'tracked'>
        & { inventoryLevels: { nodes: Array<{ location: Pick<AdminTypes.Location, 'id' | 'name'>, quantities: Array<Pick<AdminTypes.InventoryQuantity, 'name' | 'quantity'>> }> } }
      ) }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'> } };

export type VariantsMatchingCountQueryVariables = AdminTypes.Exact<{
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type VariantsMatchingCountQuery = { productVariantsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>> };

export type InventoryLevelAvailableQueryVariables = AdminTypes.Exact<{
  itemId: AdminTypes.Scalars['ID']['input'];
  locationId: AdminTypes.Scalars['ID']['input'];
}>;


export type InventoryLevelAvailableQuery = { inventoryItem?: AdminTypes.Maybe<{ inventoryLevel?: AdminTypes.Maybe<{ quantities: Array<Pick<AdminTypes.InventoryQuantity, 'name' | 'quantity'>> }> }> };

export type InventoryAdjustStockMutationVariables = AdminTypes.Exact<{
  input: AdminTypes.InventoryAdjustQuantitiesInput;
  idempotencyKey: AdminTypes.Scalars['String']['input'];
}>;


export type InventoryAdjustStockMutation = { inventoryAdjustQuantities?: AdminTypes.Maybe<{ inventoryAdjustmentGroup?: AdminTypes.Maybe<(
      Pick<AdminTypes.InventoryAdjustmentGroup, 'reason' | 'referenceDocumentUri'>
      & { changes: Array<Pick<AdminTypes.InventoryChange, 'name' | 'delta' | 'quantityAfterChange'>> }
    )>, userErrors: Array<Pick<AdminTypes.InventoryAdjustQuantitiesUserError, 'code' | 'field' | 'message'>> }> };

export type ProductUpdateSeoMutationVariables = AdminTypes.Exact<{
  product: AdminTypes.ProductUpdateInput;
}>;


export type ProductUpdateSeoMutation = { productUpdate?: AdminTypes.Maybe<{ product?: AdminTypes.Maybe<(
      Pick<AdminTypes.Product, 'id'>
      & { seo: Pick<AdminTypes.Seo, 'title' | 'description'> }
    )>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type ProductUpdateStatusMutationVariables = AdminTypes.Exact<{
  product: AdminTypes.ProductUpdateInput;
}>;


export type ProductUpdateStatusMutation = { productUpdate?: AdminTypes.Maybe<{ product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id' | 'status'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type ProductUpdateContentMutationVariables = AdminTypes.Exact<{
  product: AdminTypes.ProductUpdateInput;
}>;


export type ProductUpdateContentMutation = { productUpdate?: AdminTypes.Maybe<{ product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id' | 'title'>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type PublishProductMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  input: Array<AdminTypes.PublicationInput> | AdminTypes.PublicationInput;
}>;


export type PublishProductMutation = { publishablePublish?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

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
  sortKey?: AdminTypes.InputMaybe<AdminTypes.OrderSortKeys>;
  reverse?: AdminTypes.InputMaybe<AdminTypes.Scalars['Boolean']['input']>;
}>;


export type RecentOrdersQuery = { orders: { nodes: Array<(
      Pick<AdminTypes.Order, 'id' | 'name' | 'createdAt' | 'cancelledAt' | 'displayFinancialStatus' | 'displayFulfillmentStatus' | 'tags'>
      & { currentTotalPriceSet: { shopMoney: Pick<AdminTypes.MoneyV2, 'amount' | 'currencyCode'> }, lineItems: { nodes: Array<(
          Pick<AdminTypes.LineItem, 'title' | 'quantity'>
          & { variant?: AdminTypes.Maybe<Pick<AdminTypes.ProductVariant, 'id'>>, product?: AdminTypes.Maybe<Pick<AdminTypes.Product, 'id'>> }
        )> } }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'> } };

export type OrdersMatchingCountQueryVariables = AdminTypes.Exact<{
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type OrdersMatchingCountQuery = { ordersCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>> };

export type StoreProductCountsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type StoreProductCountsQuery = { all?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, active?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, draft?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, archived?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>> };

export type ProductHealthListQueryVariables = AdminTypes.Exact<{
  first?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  last?: AdminTypes.InputMaybe<AdminTypes.Scalars['Int']['input']>;
  before?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
  variantsFirst: AdminTypes.Scalars['Int']['input'];
  sortKey?: AdminTypes.InputMaybe<AdminTypes.ProductSortKeys>;
  reverse?: AdminTypes.InputMaybe<AdminTypes.Scalars['Boolean']['input']>;
}>;


export type ProductHealthListQuery = { products: { nodes: Array<(
      Pick<AdminTypes.Product, 'id' | 'title' | 'handle' | 'vendor' | 'status' | 'description' | 'onlineStoreUrl'>
      & { seo: Pick<AdminTypes.Seo, 'title' | 'description'>, options: Array<Pick<AdminTypes.ProductOption, 'name' | 'values'>>, mediaCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, featuredMedia?: AdminTypes.Maybe<{ preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>> }> }>, variantsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, collections: { nodes: Array<Pick<AdminTypes.Collection, 'id'>> }, variants: { nodes: Array<(
          Pick<AdminTypes.ProductVariant, 'title' | 'price' | 'inventoryQuantity'>
          & { inventoryItem: Pick<AdminTypes.InventoryItem, 'id' | 'tracked'> }
        )> } }
    )>, pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'hasPreviousPage' | 'startCursor' | 'endCursor'> } };

export type ProductsMatchingCountQueryVariables = AdminTypes.Exact<{
  query?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type ProductsMatchingCountQuery = { productsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>> };

export type ProductHealthDetailQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  variantsFirst: AdminTypes.Scalars['Int']['input'];
}>;


export type ProductHealthDetailQuery = { product?: AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'handle' | 'vendor' | 'status' | 'description' | 'onlineStoreUrl'>
    & { seo: Pick<AdminTypes.Seo, 'title' | 'description'>, options: Array<Pick<AdminTypes.ProductOption, 'name' | 'values'>>, mediaCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, featuredMedia?: AdminTypes.Maybe<{ preview?: AdminTypes.Maybe<{ image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>> }> }>, variantsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count'>>, collections: { nodes: Array<Pick<AdminTypes.Collection, 'id'>> }, variants: { nodes: Array<(
        Pick<AdminTypes.ProductVariant, 'title' | 'price' | 'inventoryQuantity'>
        & { inventoryItem: Pick<AdminTypes.InventoryItem, 'id' | 'tracked'> }
      )> } }
  )> };

export type SalesChannelsQueryVariables = AdminTypes.Exact<{
  first: AdminTypes.Scalars['Int']['input'];
}>;


export type SalesChannelsQuery = { publications: { nodes: Array<(
      Pick<AdminTypes.Publication, 'id'>
      & { catalog?: AdminTypes.Maybe<(
        Pick<AdminTypes.AppCatalog, 'title'>
        & { apps: { nodes: Array<Pick<AdminTypes.App, 'handle'>> } }
      ) | Pick<AdminTypes.CompanyLocationCatalog, 'title'> | Pick<AdminTypes.MarketCatalog, 'title'>>, includedProductsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>> }
    )> } };

export type ProductsPublishedOnQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
  publicationId: AdminTypes.Scalars['ID']['input'];
}>;


export type ProductsPublishedOnQuery = { nodes: Array<AdminTypes.Maybe<Pick<AdminTypes.Product, 'id' | 'publishedOnPublication'>>> };

interface GeneratedQueryTypes {
  "#graphql\n  query ReadinessCollections($first: Int!, $after: String) {\n    collections(first: $first, after: $after, sortKey: TITLE) {\n      nodes {\n        id\n        title\n        handle\n        productsCount { count }\n      }\n      pageInfo { hasNextPage endCursor }\n    }\n  }\n": {return: ReadinessCollectionsQuery, variables: ReadinessCollectionsQueryVariables},
  "#graphql\n  query InventoryLocations($first: Int!, $after: String) {\n    locations(first: $first, after: $after, sortKey: NAME) {\n      nodes { id name }\n      pageInfo { hasNextPage endCursor }\n    }\n  }\n": {return: InventoryLocationsQuery, variables: InventoryLocationsQueryVariables},
  "#graphql\n  query InventoryVariants(\n    $first: Int\n    $after: String\n    $last: Int\n    $before: String\n    $query: String\n    $levelsFirst: Int!\n    $sortKey: ProductVariantSortKeys = INVENTORY_QUANTITY\n    $reverse: Boolean = false\n  ) {\n    productVariants(\n      first: $first\n      after: $after\n      last: $last\n      before: $before\n      query: $query\n      sortKey: $sortKey\n      reverse: $reverse\n    ) {\n      nodes {\n        id\n        title\n        product { id title }\n        inventoryItem {\n          id\n          tracked\n          inventoryLevels(first: $levelsFirst) {\n            nodes {\n              location { id name }\n              quantities(names: [\"available\"]) { name quantity }\n            }\n          }\n        }\n      }\n      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n    }\n  }\n": {return: InventoryVariantsQuery, variables: InventoryVariantsQueryVariables},
  "#graphql\n  query VariantsMatchingCount($query: String) {\n    productVariantsCount(query: $query, limit: null) { count precision }\n  }\n": {return: VariantsMatchingCountQuery, variables: VariantsMatchingCountQueryVariables},
  "#graphql\n  query InventoryLevelAvailable($itemId: ID!, $locationId: ID!) {\n    inventoryItem(id: $itemId) {\n      inventoryLevel(locationId: $locationId) {\n        quantities(names: [\"available\"]) { name quantity }\n      }\n    }\n  }\n": {return: InventoryLevelAvailableQuery, variables: InventoryLevelAvailableQueryVariables},
  "#graphql\n  query ShopTimezone {\n    shop { ianaTimezone }\n  }\n": {return: ShopTimezoneQuery, variables: ShopTimezoneQueryVariables},
  "#graphql\n  query OrderCounts($today: String!, $unfulfilled: String!) {\n    today: ordersCount(query: $today, limit: null) { count precision }\n    unfulfilled: ordersCount(query: $unfulfilled, limit: null) { count precision }\n  }\n": {return: OrderCountsQuery, variables: OrderCountsQueryVariables},
  "#graphql\n  query RecentOrders(\n    $first: Int\n    $after: String\n    $last: Int\n    $before: String\n    $query: String\n    $lineItemsFirst: Int!\n    $sortKey: OrderSortKeys = CREATED_AT\n    $reverse: Boolean = true\n  ) {\n    orders(\n      first: $first\n      after: $after\n      last: $last\n      before: $before\n      query: $query\n      sortKey: $sortKey\n      reverse: $reverse\n    ) {\n      nodes {\n        id\n        name\n        createdAt\n        cancelledAt\n        displayFinancialStatus\n        displayFulfillmentStatus\n        tags\n        currentTotalPriceSet { shopMoney { amount currencyCode } }\n        lineItems(first: $lineItemsFirst) {\n          nodes {\n            title\n            quantity\n            variant { id }\n            product { id }\n          }\n        }\n      }\n      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n    }\n  }\n": {return: RecentOrdersQuery, variables: RecentOrdersQueryVariables},
  "#graphql\n  query OrdersMatchingCount($query: String) {\n    ordersCount(query: $query, limit: null) { count precision }\n  }\n": {return: OrdersMatchingCountQuery, variables: OrdersMatchingCountQueryVariables},
  "#graphql\n  query StoreProductCounts {\n    all: productsCount(limit: null) { count precision }\n    active: productsCount(query: \"status:active\", limit: null) { count precision }\n    draft: productsCount(query: \"status:draft\", limit: null) { count precision }\n    archived: productsCount(query: \"status:archived\", limit: null) { count precision }\n  }\n": {return: StoreProductCountsQuery, variables: StoreProductCountsQueryVariables},
  "#graphql\n  query ProductHealthList(\n    $first: Int\n    $after: String\n    $last: Int\n    $before: String\n    $query: String\n    $variantsFirst: Int!\n    $sortKey: ProductSortKeys = TITLE\n    $reverse: Boolean = false\n  ) {\n    products(\n      first: $first\n      after: $after\n      last: $last\n      before: $before\n      query: $query\n      sortKey: $sortKey\n      reverse: $reverse\n    ) {\n      nodes {\n        id\n        title\n        handle\n        vendor\n        status\n        description\n        onlineStoreUrl\n        seo { title description }\n        options { name values }\n        mediaCount { count }\n        featuredMedia { preview { image { url altText } } }\n        variantsCount { count }\n        collections(first: 1) { nodes { id } }\n        variants(first: $variantsFirst) {\n          nodes {\n            title\n            price\n            inventoryQuantity\n            inventoryItem { id tracked }\n          }\n        }\n      }\n      pageInfo { hasNextPage hasPreviousPage startCursor endCursor }\n    }\n  }\n": {return: ProductHealthListQuery, variables: ProductHealthListQueryVariables},
  "#graphql\n  query ProductsMatchingCount($query: String) {\n    productsCount(query: $query, limit: null) { count precision }\n  }\n": {return: ProductsMatchingCountQuery, variables: ProductsMatchingCountQueryVariables},
  "#graphql\n  query ProductHealthDetail($id: ID!, $variantsFirst: Int!) {\n    product(id: $id) {\n      id\n      title\n      handle\n      vendor\n      status\n      description\n      onlineStoreUrl\n      seo { title description }\n      options { name values }\n      mediaCount { count }\n      featuredMedia { preview { image { url altText } } }\n      variantsCount { count }\n      collections(first: 1) { nodes { id } }\n      variants(first: $variantsFirst) {\n        nodes {\n          title\n          price\n          inventoryQuantity\n          inventoryItem { id tracked }\n        }\n      }\n    }\n  }\n": {return: ProductHealthDetailQuery, variables: ProductHealthDetailQueryVariables},
  "#graphql\n  query SalesChannels($first: Int!) {\n    publications(first: $first, catalogType: APP) {\n      nodes {\n        id\n        catalog {\n          title\n          ... on AppCatalog {\n            apps(first: 1) { nodes { handle } }\n          }\n        }\n        includedProductsCount(limit: null) { count precision }\n      }\n    }\n  }\n": {return: SalesChannelsQuery, variables: SalesChannelsQueryVariables},
  "#graphql\n  query ProductsPublishedOn($ids: [ID!]!, $publicationId: ID!) {\n    nodes(ids: $ids) {\n      ... on Product {\n        id\n        publishedOnPublication(publicationId: $publicationId)\n      }\n    }\n  }\n": {return: ProductsPublishedOnQuery, variables: ProductsPublishedOnQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation InventoryAdjustStock(\n    $input: InventoryAdjustQuantitiesInput!\n    $idempotencyKey: String!\n  ) {\n    inventoryAdjustQuantities(input: $input) @idempotent(key: $idempotencyKey) {\n      inventoryAdjustmentGroup {\n        reason\n        referenceDocumentUri\n        changes { name delta quantityAfterChange }\n      }\n      userErrors { code field message }\n    }\n  }\n": {return: InventoryAdjustStockMutation, variables: InventoryAdjustStockMutationVariables},
  "#graphql\n  mutation ProductUpdateSeo($product: ProductUpdateInput!) {\n    productUpdate(product: $product) {\n      product { id seo { title description } }\n      userErrors { field message }\n    }\n  }\n": {return: ProductUpdateSeoMutation, variables: ProductUpdateSeoMutationVariables},
  "#graphql\n  mutation ProductUpdateStatus($product: ProductUpdateInput!) {\n    productUpdate(product: $product) {\n      product { id status }\n      userErrors { field message }\n    }\n  }\n": {return: ProductUpdateStatusMutation, variables: ProductUpdateStatusMutationVariables},
  "#graphql\n  mutation ProductUpdateContent($product: ProductUpdateInput!) {\n    productUpdate(product: $product) {\n      product { id title }\n      userErrors { field message }\n    }\n  }\n": {return: ProductUpdateContentMutation, variables: ProductUpdateContentMutationVariables},
  "#graphql\n  mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {\n    publishablePublish(id: $id, input: $input) {\n      userErrors { field message }\n    }\n  }\n": {return: PublishProductMutation, variables: PublishProductMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
