# !/bin/bash

# stop the script if a command fails
set -e

# Update the package lists for upgrades for packages that need upgrading & Update the packages on the system.
sudo apt update && sudo apt upgrade -y

# install mysql & unzip
sudo apt install -y mysql-server unzip

# start and enable mysql
sudo systemctl start mysql
sudo systemctl enable mysql

# access server ip address & bind to ip address
ipaddress=$(hostname -I | awk '{print $1}')
sudo sed -i "s/^bind-address.*/bind-address = $ipaddress/" /etc/mysql/mysql.conf.d/mysqld.cnf

#restart mysql
sudo systemctl restart mysql

# create a database
sudo mysql -u root -e "create database newdb;"

# create a new linux group for the application
sudo groupadd newgroup

# create a new user of the application
sudo useradd -m -g newgroup newuser

# make sure /opt/csye6225 exist
sudo mkdir -p /opt/csye6225

# unzip
unzip -o webapp.zip -d /opt/csye6225


# Update the permissions of the folder and artifacts in the directory.
sudo chown -R newuser:newgroup /opt/csye6225
sudo chmod -R 750 /opt/csye6225



