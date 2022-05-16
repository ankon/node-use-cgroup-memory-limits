# @ankon/use-cgroup-memory-limits

A small wrapper around NodeJS that looks at the Cgroups memory settings, and sets the `--max-old-space-size` command-line argument in `NODE_OPTIONS` when it is not yet set.

## Usage

1. Install as a runtime dependency

   ```sh
   npm install @ankon/use-group-memory-limits
   ```

2. Use `use-cgroup-memory-limits` instead of `node` in your start scripts

   ```jsonc
   {
       "name": "my-package",
       // ...
       "scripts": {
           "start": "use-cgroup-memory-limits my-package-index.js"
       },
       // ...
   }
   ```

## License


```LICENSE
This software is licensed under the Apache 2 license, quoted below.

Copyright 2022 Andreas Kohn <andreas.kohn@gmail.com>
Copyright 2020 Collaborne B.V. <http://github.com/Collaborne/>

Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License. You may obtain a copy of
the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations under
the License.
```
