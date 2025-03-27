packer {
  required_plugins {
    amazon = {
      version = ">= 1.0.0, < 2.0.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

variable "cloud" {
  type    = string
  default = ""
}

variable "aws_region" { //used
  type    = string
  default = "us-east-1"
}

variable "source_ami" { //used
  type    = string
  default = "ami-04b4f1a9cf54c11d0" # Ubuntu 24.04 LTS us-east-1 
}

variable "ssh_username" {
  type    = string
  default = "ubuntu"
}

variable "subnet_id" { //used
  type    = string
  default = "subnet-02d16bca0e034eea1"
}

source "amazon-ebs" "my-aws-ami" {
  region   = var.aws_region
  ami_name = "csye6225_spring_2025_app_${formatdate("YYYY_MM_DD", timestamp())}"

  ami_description = "AMI for CSYE 6225 Spring 2025"
  instance_type   = "t2.small"
  source_ami      = var.source_ami
  ssh_username    = var.ssh_username
  subnet_id       = var.subnet_id

  launch_block_device_mappings {
    delete_on_termination = true
    device_name           = "/dev/sda1"
    volume_size           = 25
    volume_type           = "gp2"
  }

  tags = {
    "Name" = "CSYE6225-App-Image"
  }
}

//variable "MYSQL_DB_NAME" {
//  type    = string
//  default = ""
//}

//variable "MYSQL_ROOT_PASSWORD" {
//  type    = string
//  default = ""
//}

build {
  name = "my-first-build"
  sources = [
    "source.amazon-ebs.my-aws-ami",

  ]

  provisioner "file" {
    source      = "./index.js"
    destination = "/tmp/index.js"
  }

  provisioner "file" {
    source      = "./package.json"
    destination = "/tmp/package.json"
  }

  //provisioner "file" {
  //source      = "./tests"
  //destination = "/tmp/tests"
  //}

  //第六次作业
  provisioner "file" {
    source      = "./amazon-cloudwatch-agent.json"
    destination = "/tmp/amazon-cloudwatch-agent.json"
  }


  provisioner "shell" {
    environment_vars = [
      "DEBIAN_FRONTEND=noninteractive",
      //"MYSQL_DB_NAME=${var.MYSQL_DB_NAME}",
      //"MYSQL_ROOT_PASSWORD=${var.MYSQL_ROOT_PASSWORD}"
    ]
    inline = [
      "sudo apt-get update && sudo apt-get upgrade -y",
      "sudo apt-get install -y nodejs npm",


      "wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb",

      "sudo dpkg -i amazon-cloudwatch-agent.deb",


      "rm amazon-cloudwatch-agent.deb",


      "sudo groupadd csye6225",
      "sudo useradd -m -g csye6225 -s /usr/sbin/nologin csye6225",
      //
      "sudo mkdir -p /opt/csye6225/logs",
      //

      "sudo mv /tmp/index.js /opt/csye6225/index.js",
      "sudo mv /tmp/package.json /opt/csye6225/package.json",
      //"sudo mv /tmp/tests /opt/csye6225/tests",

      //"sudo bash -c 'echo DIALECT=mysql >> /opt/csye6225/.env'",
      "sudo bash -c 'echo PORT=8080 >> /opt/csye6225/.env'",
      "sudo bash -c 'echo NODE_ENV=development >> /opt/csye6225/.env'",

      "sudo chown -R csye6225:csye6225 /opt/csye6225",
      "sudo chmod -R 750 /opt/csye6225",
      "sudo chmod 600 /opt/csye6225/.env",
      "sudo bash -c 'cd /opt/csye6225 && npm install dotenv hot-shots winston --unsafe-perm=true --allow-root'",


      "echo '[Service]' | sudo tee /etc/systemd/system/csye6225.service",
      "echo 'ExecStart=/usr/bin/node /opt/csye6225/index.js' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'WorkingDirectory=/opt/csye6225' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'Restart=always' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'User=csye6225' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'Group=csye6225' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'EnvironmentFile=/etc/environment' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo '[Install]' | sudo tee -a /etc/systemd/system/csye6225.service",
      "echo 'WantedBy=multi-user.target' | sudo tee -a /etc/systemd/system/csye6225.service",

      "sudo systemctl daemon-reload",
      "sudo systemctl enable csye6225",



      "sudo mkdir -p /opt/aws/amazon-cloudwatch-agent/etc",
      "sudo mv /tmp/amazon-cloudwatch-agent.json /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",

      "sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s"




    ]
  }

}
