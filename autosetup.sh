# !/bin/bash

# stop the script if a command fails
set -e

MYSQL_ROOT_PASSWORD="1234Aa"
DB_NAME="cloud_computing"

# Update the package lists for upgrades for packages that need upgrading & Update the packages on the system.
sudo apt update && sudo apt upgrade -y

# install mysql & unzip & Node.js
sudo apt install -y mysql-server unzip nodejs npm


# start and enable mysql
sudo systemctl start mysql
sudo systemctl enable mysql

# access server ip address & bind to ip address
sudo sed -i "s/^bind-address.*/bind-address = 127.0.0.1/" /etc/mysql/mysql.conf.d/mysqld.cnf

#restart mysql
sudo systemctl restart mysql

# set root password and apply privileges
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${MYSQL_ROOT_PASSWORD}'; FLUSH PRIVILEGES;"

# create the database 
sudo mysql -u root -p"${MYSQL_ROOT_PASSWORD}" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;"

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



