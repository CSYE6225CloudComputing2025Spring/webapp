# 🛠️ File Management Rest API CI/CD & Packer AMI Build

This repository handles **REST API**,**CI/CD pipeline**, **Packer AMI builds**, and **EC2 deployment automation** for the CSYE6225 web application.  
It works collabratively with the [CSYE6225CloudComputing2025Spring/tf-aws-infra](https://github.com/CSYE6225CloudComputing2025Spring/tf-aws-infra) repository (contains Terraform infrastructure code). You should apply the terraform code in that repo first and then commit in this repo to trigger the CI/CD and Packer AMI Build.

---

## 📦 What This Repo Does

- Runs **GitHub Actions** on every push to `main`
- Builds and uploads app artifact (`index.js`, `package.json`)
- Uses **Packer** to build a custom AMI
- Updates **EC2 Launch Template** with new AMI
- Refreshes the **Auto Scaling Group** to trigger new deployments
- Shares AMI with DEMO AWS Account

---

## ⚙️ Technologies Used

- **GitHub Actions** – for CI/CD workflow automation
- **Packer** – for building Amazon Machine Images (AMI)
- **AWS CLI** – to update EC2 resources (AMI, Launch Template, ASG)

## Rest API Introduction
This Node.js Express API provides secure, RESTful endpoints for file upload, retrieval, deletion, and health checks, designed to work in a cloud-native AWS environment. It supports integration with Amazon S3, MySQL via RDS, and collects metrics via StatsD and logs via Winston, which are forwarded to Amazon CloudWatch.

### Prerequisites for building and deploying your application locally:
Operating System**: Ubuntu 24.04 LTS  
Programming Language: Node.js 
NPM (Node Package Manager)   
Relational Database: MySQL(RDS)
ORM Framework: JavaScript: Sequelize  

### API Endpoints  
#### 🔍 Health Check  
GET /healthz  
Performs application and database health validation.  
Accepts only GET. Any other method returns 405 Method Not Allowed.  
Returns 200 OK if healthy; 503 if DB write fails; 400 if body/query is not empty.  

#### 📤 File Upload    
POST /v1/file  
Uploads a file (expected field: profilePic) to Amazon S3.  
Saves file metadata to RDS (MySQL).  
Responds with metadata including file id, url, upload_date.  
Returns 400 if file is missing or empty.  

#### 📄 Get File Metadata  
GET /v1/file/:id  
Retrieves metadata (filename, URL, upload date) of the uploaded file using its UUID.  
Returns 404 if file not found.  

#### 🗑️ Delete File    
DELETE /v1/file/:id  
Deletes both the file in S3 and its metadata in RDS.  
Returns 404 if file ID is invalid.  
Returns 204 No Content on successful deletion.  

#### ❌ Invalid Method Handling  
All unsupported methods (e.g., PATCH, PUT, OPTIONS, etc.) return:   
405 Method Not Allowed   








