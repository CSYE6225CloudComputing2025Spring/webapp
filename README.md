# Health Check REST API 


# Project Overview
This is a backend API-only web application designed to be deployed to cloud. It provides a Health Check API (`/healthz`), ensuring the database connection is active. 

# Prerequisites for building and deploying your application locally:
Operating System**: Ubuntu 24.04 LTS
Programming Language: Node.js
NPM (Node Package Manager)
Relational Database: MySQL 
ORM Framework: JavaScript: Sequelize

# API Endpoint
/healthz:
Insert the record in the health check table.
Return HTTP 200 OK if the record was inserted successfully.
Return HTTP 503 Service Unavailable if the insert command was  unsuccessful.
The API response should not be cached. Make sure to add cache-control: 'no-cache' header to the response.
The API request should not allow for any payload. The response code should be 400 Bad Request if the request includes any payload.
The API response should not include any payload.
Only HTTP GET the method is supported by the /healthz endpoint. All other methods should return HTTP code for Method Not Allowed.









