using Blocks.Genesis;
using DataGateway.DomainService.Models.Responses;
using DataGateway.DomainService.Models;
using DataGateway.DomainService.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;

namespace Api.Controllers.DataGateway
{
    /// <summary>
    /// Controller for managing platform data source configurations.
    /// Provides endpoints to retrieve, create, and update data source configurations for projects.
    /// </summary>
    [Route("data-sources")]
    [ApiController]
    public class DataSourceController : ControllerBase
    {
        private readonly IDataSourceService _dataSourceService;
        private readonly ChangeControllerContext _changeControllerContext;

        /// <summary>
        /// Initializes a new instance of the <see cref="DataSourceController"/> class.
        /// </summary>
        /// <param name="dataSourceService">The data source service.</param>
        /// <param name="changeControllerContext">The change Controller service.</param>
        /// <exception cref="ArgumentNullException">Thrown when the platform data configuration service is null.</exception>
        public DataSourceController(IDataSourceService dataSourceService, ChangeControllerContext changeControllerContext)
        {
            _dataSourceService = dataSourceService ?? throw new ArgumentNullException(nameof(dataSourceService));
            _changeControllerContext = changeControllerContext ?? throw new ArgumentNullException(nameof(changeControllerContext));
        }

        /// <summary>
        /// Cloud use only: Retrieves the data source configuration for a specific project. Use this endpoint to get the database connection details for your platform.
        /// </summary>
        /// <param name="projectKey">The unique identifier for the project whose data source configuration you want to retrieve.</param>
        /// <returns>Returns the data source configuration details, including the connection string, database name, and project key, or an error message if the data source is not found.</returns>
        [Authorize]
        [HttpGet("{projectKey}/get")]
        [ProducesResponseType(typeof(ServiceResponse<DataSourceResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetDataSourcesAsync([FromRoute] string projectKey)
        {
            try
            {
                _changeControllerContext.ChangeContext(new ProjectKeyModel
                {
                    ProjectKey = projectKey
                });
                var response = await _dataSourceService.GetDataSource(projectKey);
                return Ok(response);
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
            }
        }
        /// <summary>
        /// Retrieves the data source configuration for a specific project. Use this endpoint to get the database connection details for your platform.
        /// </summary>
        /// <param name="projectKey">The unique identifier of the project to retrieve.</param>
        /// <returns>Returns the data source configuration details, including the connection string, database name, and project key, or an error message if the data source is not found.</returns>
        [Authorize]
        [HttpGet("get")]
        [ProducesResponseType(typeof(ServiceResponse<DataSourceResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> GetProjectDataSourcesAsync(string projectKey = "")
        {
            try
            {
                _changeControllerContext.ChangeContext(new ProjectKeyModel
                {
                    ProjectKey = projectKey
                });

                if (string.IsNullOrEmpty(projectKey))
                {
                    projectKey = BlocksContext.GetContext()?.TenantId;
                }
                var response = await _dataSourceService.GetDataSource(projectKey);
                return StatusCode(response.HttpStatusCode, response);
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
            }
        }

        /// <summary>
        /// Creates a new data source configuration. Use this endpoint to add a new database connection for your platform.
        /// </summary>
        /// <param name="request">The data source details to be saved. Required fields: ItemId (unique identifier), ConnectionString (database connection string), DatabaseName (name of the database), ProjectKey (project identifier).</param>
        /// <returns>Returns a success response if the data source is created, or an error message if the operation fails.</returns>
        [Authorize]
        [HttpPost("add")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> InsertDataSourceAsync([FromBody] CreateDataSourceRequest request)
        {
            try
            {
                _changeControllerContext.ChangeContext(request);
                var response = await _dataSourceService.InsertDataSource(request);
                return StatusCode(response.HttpStatusCode, response);
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
            }
        }

        /// <summary>
        /// Updates an existing data source configuration. Use this endpoint to modify the connection string, database name, or other details for an existing data source.
        /// </summary>
        /// <param name="request">The updated data source details. Required fields: ItemId (unique identifier), ConnectionString, DatabaseName, ProjectKey, IsActive.</param>
        /// <returns>Returns a success response if the data source is updated, or an error message if the operation fails.</returns>
        [Authorize]
        [HttpPut("update")]
        [ProducesResponseType(typeof(ServiceResponse<ActionResponse>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<IActionResult> UpdateDataSourceAsync([FromBody] UpdateDataSourceRequest request)
        {
            try
            {
                _changeControllerContext.ChangeContext(request);
                var response = await _dataSourceService.UpdateDataSource(request);
                return StatusCode(response.HttpStatusCode, response);
            }
            catch (Exception ex)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new { message = ex.Message });
            }
        }
    }
}
