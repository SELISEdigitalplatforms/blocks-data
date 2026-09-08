using System;
using Blocks.Genesis;
using DataGateway.DomainService.Entities;
using DataGateway.DomainService.Models;
using MongoDB.Bson;
using MongoDB.Driver;

namespace DataGateway.DomainService.Repositories;

public interface IDbRepository
{
    #region Get
    Task<T?> GetItemAsync<T>(FilterDefinition<T> filter, string databaseName = "")
        where T : GraphQlBaseEntity;
    Task<T?> GetItemAsync<T>(string id, string databaseName = "")
        where T : GraphQlBaseEntity;
    Task<BsonDocument?> GetItemAsync(string collectionName, string id, string databaseName = "");
    Task<BsonDocument?> GetItemAsync(string collectionName, FilterDefinition<BsonDocument> filter, string databaseName = "");
    #endregion
    #region Get Items
    Task<List<TResponse>> GetItemsAsync<TEntity, TResponse>(
        FilterDefinition<TEntity> filter,
        SortDefinition<TEntity>? sort = null,
        string databaseName = "") where TEntity : GraphQlBaseEntity;
    Task<List<T>> GetItemsAsync<T>(
        FilterDefinition<BsonDocument> filter,
        SortDefinition<BsonDocument>? sort = null,
        ProjectionDefinition<BsonDocument>? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "")
        where T : GraphQlBaseEntity;

    Task<List<BsonDocument>> GetItemsAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "");

    Task<(List<T> items, long count)> GetItemsWithCountAsync<T>(
        FilterDefinition<BsonDocument> filter,
        SortDefinition<BsonDocument>? sort = null,
        ProjectionDefinition<BsonDocument>? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "")
        where T : GraphQlBaseEntity;

    Task<(List<BsonDocument> items, long count)> GetItemsWithCountAsync(string collectionName,
        FilterDefinition<BsonDocument> filter,
        BsonDocument? sort = null,
        BsonDocument? projection = null,
        int skip = 0,
        int limit = 10,
        string databaseName = "");

    Task<BsonDocument?> AggregateOneAsync<T>(BsonDocument[] pipeline, string databaseName = "")
        where T : GraphQlBaseEntity;
    #endregion
    #region Insert
    Task<T> InsertAsync<T>(T data, string databaseName = "") where T : GraphQlBaseEntity;
    Task<BsonDocument> InsertAsync(string collectionName, BsonDocument data, string databaseName = "");
    Task<List<T>> InsertManyAsync<T>(List<T> data, string databaseName = "") where T : GraphQlBaseEntity;
    Task<List<BsonDocument>> InsertManyAsync(string collectionName, List<BsonDocument> data, string databaseName = "");
    #endregion
    #region Update
    Task<ActionResponse> UpdateAsync<T>(T data, string databaseName = "") where T : GraphQlBaseEntity;
    Task<ActionResponse> UpdateAsync<T>(FilterDefinition<T> filter, T data, string databaseName = "") where T : GraphQlBaseEntity;
    Task<ActionResponse> UpdateAsync(string collectionName, BsonDocument filter, BsonDocument data, string databaseName = "");

    Task<ActionResponse> UpdateManyAsync<T>(List<T> data, string databaseName = "") where T : GraphQlBaseEntity;
    Task<ActionResponse> UpdateManyAsync(string collectionName, BsonDocument filter, BsonDocument data, string databaseName = "");
    #endregion
    #region Delete
    Task<ActionResponse> DeleteAsync<T>(FilterDefinition<T> filter, string databaseName = "") where T : GraphQlBaseEntity;
    Task<ActionResponse> DeleteAsync(string collectionName, BsonDocument filter, string databaseName = "");

    Task<ActionResponse> DeleteManyAsync<T>(FilterDefinition<T> filter, string databaseName = "") where T : GraphQlBaseEntity;
    Task<ActionResponse> DeleteManyAsync(string collectionName, BsonDocument filter, string databaseName = "");
    #endregion
    #region Upsert
    Task<ActionResponse> UpsertAsync<T>(T data, string databaseName = "") where T : GraphQlBaseEntity;
    Task<ActionResponse> UpsertAsync(string collectionName, BsonDocument data, string databaseName = "");
    Task<ActionResponse> UpsertManyAsync<T>(List<T> data, string databaseName = "") where T : GraphQlBaseEntity;
    #endregion
    #region Index
    /// <summary>
    /// Creates a MongoDB index on an arbitrary, user-defined data collection (not a
    /// GraphQlBaseEntity-typed collection), for an ordered list of field name/direction pairs.
    /// Direction is the raw Mongo sort value: 1 for ascending, -1 for descending.
    /// </summary>
    Task<ActionResponse> CreateIndexAsync(string collectionName, List<(string FieldName, int Direction)> keys, bool isUnique, string indexName, string databaseName = "");

    /// <summary>
    /// Drops a previously created index by name from the given data collection.
    /// </summary>
    Task<ActionResponse> DropIndexAsync(string collectionName, string indexName, string databaseName = "");
    #endregion
}
