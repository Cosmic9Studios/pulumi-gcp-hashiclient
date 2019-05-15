
/etc/nomad.d/client.hcl:
  file.managed:
    - source:
      - 'salt://files/client.hcl'

# Download 
curl -o nomad.zip https://releases.hashicorp.com/nomad/0.8.7/nomad_0.8.7_linux_amd64.zip: 
  cmd.run:
    - creates: /usr/bin/nomad

# Place in bin directory
unzip nomad.zip:
  cmd.run: 
    - creates: /usr/bin/nomad

sudo mv nomad /usr/bin:
  cmd.run: 
    - creates: /usr/bin/nomad

rm -rf nomad.zip:
  cmd.run: 
    - creates: /usr/bin/nomad

echo "nomad agent -config=/etc/nomad.d" > /scripts/nomad.sh:
  cmd.run: 
    - creates: /scripts/nomad.sh