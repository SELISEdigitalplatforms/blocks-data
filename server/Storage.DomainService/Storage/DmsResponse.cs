using Microsoft.AspNetCore.Mvc;
using System.Net;

namespace Storage.DomainService.Storage
{
    public class DmsResponse
    {
        public dynamic Result { get; set; }
        public string Message { get; set; }
        public HttpStatusCode HttpStatusCode { get; set; }


        public DmsResponse WithMessage(string message)
        {
            Message = message;

            return this;
        }

        public DmsResponse WithResult(object result)
        {
            Result = result;

            return this;
        }

        public DmsResponse WithStatusCode(HttpStatusCode code)
        {
            HttpStatusCode = code;

            return this;
        }
    }

    public static class Response
    {
        public static DmsResponse Build()
        {
            return new DmsResponse();
        }

    }
}
