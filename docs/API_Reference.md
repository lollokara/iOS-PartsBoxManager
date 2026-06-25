
API Documentation
=================

The API is intended for interfacing other software with PartsBox, to allow integration and automation.

Please read the "Warnings and pitfalls" section.

Example
-------

A quick example is the best way to show what you can expect from the API.

Request:

```
curl -X POST \
  -d '{"part/id": "1pbvre0cfg4f58azmvsgetasxq"}' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: APIKey partsboxapi_412k7ab40agdsa0tgfbcjbc46m8c728c1fd1a33728687f520a43dd16df03801f' \
  https://api.partsbox.com/api/1/part/get
```


Response:

```
{
  "data": {"part/id": "1pbqre1cfg4f59azmvsyftqsxe",
           "part/description": "Noninverting Buffer / CMOS Logic Level Shifter",
           "part/footprint": "SC-70",
           "part/stock": [{"stock/currency": "usd",
                           "stock/price": 0.1673,
                           "stock/quantity": 200,
                           "stock/storage-id": "1pbr3bmcfg4f59azmvsyftqsxq",
                           "stock/timestamp": 1400928853000},
                          {"stock/quantity": -2,
                           "stock/storage-id": "1pbr3bmcfg4f59azmvsyftqsxq",
                           "stock/timestamp": 1421068653000},
                          {"stock/comments": "LED Bracelet 2.0",
                           "stock/quantity": -1,
                           "stock/storage-id": "1pbr3bmcfg4f59azmvsyftqsxq",
                           "stock/timestamp": 1451661746344}],
           "part/owner": "411k7fb41agesa0tgcbcjbc46q",
           "part/linked-id": "f3ar9ej8npk059dnmfmh6xvcw6",
           "part/name": "M74VHC1GT126DF1G",
           "part/type": "linked",
           "part/manufacturer": "onsemi",
           "part/mpn": "M74VHC1GT126DF1G",
           "part/created": 1400928853000},
  "partsbox.status/category": "ok",
  "partsbox.status/message": "OK"
}
```


General design and notes
------------------------

This is not a REST API. REST was designed for representing resources and manipulating them directly through create, read, update and delete operations. PartsBox is much more about performing complex operations and getting aggregated information. While there is a database underneath, not all objects can be directly manipulated, and there are many consistency checks and constraints to be enforced. Therefore, the API is operation-oriented. It is possible to get all the data objects, but it isn't always possible to change them directly.

### Modes

The API can use one of two serialization methods: either JSON or EDN. The default is JSON, but if you prefer EDN, pass an additional "mode" parameter set to "edn" to any operation, which will cause PartsBox to use EDN for parsing parameters and generating return values.

### Passing parameters

Parameters can be passed in several ways, with each subsequent method overriding the previous ones:

*   Form URL-encoded
*   Multipart
*   JSON body
*   Query

The recommended way is to use POST requests with a text body (JSON or EDN) containing the object with parameters. It is possible to override some parameters using query strings, or use GET requests with query strings for simpler API calls where only string parameters are required. Note that query strings in GET requests do not allow passing anything else than a string, so certain calls will never work. For example, it isn't possible to pass an integer `stock/quantity` in a query string.

Some API parameters described in the documentation will be available only with certain plan features.

### Return values

Every API call returns a JSON or EDN object with status information. Additionally, when data is being returned, it will be available under the `data` key. The only exception to this are methods that return images (for example, the image of an ID Anything™ QR code), in which case an image with an appropriate Content-Type will be returned.

### Errors

Errors will result in HTTP error codes, with responses also containing a JSON object with status information.

### Date and time handling

PartsBox stores all date/time information using 64-bit UNIX timestamps in UTC time zone.

WARNING: It is your responsibility to convert to and from your time zone to UTC time. This will not be done for you automatically (as done when accessing PartsBox in a browser), and can easily be a source of errors.

### Areas most likely to change in the future

*   Projects: planned introduction of project versioning might mean changes in the way project entries are retrieved.
*   Stock entries: work on features like stock allocations, reservations, planned builds is already in progress. This means that stock entries will start having a status and will not necessarily represent the stock that is on-hand and available. There will be additional API calls for calculating the currently available stock, as it is not an obvious operation.
*   Stock quantities: while they are integer numbers now, expect floating-point values as well, together with units of measure support.

Authentication
--------------

Calls to the API require authentication. PartsBox supports authentication using an API key, or using Oauth2 (support coming soon).

API keys can be generated in the Settings | Data panel. The Hobbyist/Maker plan allows one API key, for accessing your personal database.

Commercial users can add multiple API users with different roles. API users do not count towards the organization user limit, so you can create as many as you need. Choose a meaningful name for an API user, as it will be shown in places like stock and build history. If your plan includes Role-Based Access Control (RBAC), you can also define your own roles with specific permissions (in the Sharing tab), limiting the access for each API user individually.

Please guard your API keys carefully, as they provide full access to your PartsBox database. Make sure not to keep them in your code repositories.

Every call to the API must have an `Authorization` header containing the API key. Example: `Authorization: APIKey partsboxapi_fg29zq83d8gfbcbxkdsexfdw950b98a70be5fd20da6b72dc8ed3b2c11f756fba`

Endpoints
---------

All HTTP API requests are of the form `https://api.partsbox.com/api/1/[operation]`. Please do not use other hosts than `api.partsbox.com` — even if it works today, it is not guaranteed in the future.

For example, to get information about a part, you would make a GET or POST request to `https://api.partsbox.com/api/1/part/get`.

Support, reporting bugs and problems, feature requests
------------------------------------------------------

The API is subject to change. Please do not assume that it is a contract. It has to evolve, and while every attempt will be made to keep existing functionality intact, this cannot always be guaranteed in a cost-effective way.

If an API call you expect to be present is missing, please contact support. API calls are added on an as-needed basis.

The API is available for every PartsBox user, including those on the free Hobbyist/Maker plan. However, please understand that it is impossible to provide support and help for everyone without ruining the business. This is why support for the API is different than anywhere else in PartsBox. Specifically:

*   If you are on a commercial plan, you can expect normal support.
*   If you have a free Hobbyist/Maker account, please _do not expect a reply_ to your E-mails about the API. Your E-mail _will_ always be read, and bug reports, observations, feature requests (especially with descriptions of real-world scenarios) are very welcome — but do not expect that you will get a response. Communication has to be one-way in order for the business to be viable in the long term.

Rate limiting
-------------

Please expect rate limits to be enforced, to be announced later. If you are interfacing to the PartsBox API, plan ahead and implement reasonable rate limiting right from the start.

Warnings and pitfalls
---------------------

The API does a lot of checking, but it will not always prevent you from shooting yourself in the foot. Be extra careful with destructive operations: deleting parts or reverting builds are especially dangerous, as you might not realize what else in PartsBox depends on the part's stock history being there.

Modifying stock history is similarly problematic: if you modify the quantity in an older add stock entry or delete the entry altogether, subsequent remove stock entries will remain, and you might end up with negative stock counts. PartsBox tries very hard to prevent that from happening, but not every possible problem can be detected.

PartsBox has no knowledge of time zones. Timestamps are 64-bit numbers representing the UNIX time in UTC. If you just convert your local time to a timestamp, it will not be UTC, and you will get incorrect times shown in the web interface. To store timestamps, you _must_ convert your date and time to UTC, and then convert it to a 64-bit timestamp.

PartsBox does not store the total stock count anywhere. In order to get stock counts, you need to go through stock history and calculate them. However, please do not assume that you can simply use the sum of quantity fields. After stock statuses are introduced, this will conflate stock that is on-hand with stock that has been ordered, allocated or held. You will need to compute totals for each status separately.

Terms of Service
----------------

All of the PartsBox Terms of Service apply.

PartsBox reserves the right to terminate your API access at any time, for any reason.

Please note that PartsBox® is a registered trademark. If you intend to publish your code, make sure that the name of the project does not include "PartsBox".

The API is intended for interfacing your software with PartsBox in order to allow automation. You are specifically not allowed to create new user interfaces (apps, shells) that provide a significant part of the functionality of the PartsBox user interface. In other words, automating is fine, building a new inventory control app that uses the API as an engine is not.

Parts
-----

### part/get

Get single part data

This will return data for a single part. If this is a linked part, there will be a `part/linked-id` field, but you will not get all linked information (such as specs or datasheet links), because of licensing restrictions. `part/mpn` and `part/manufacturer` fields will be overriden based on linked data. `:part/description` will contain either the linked description, or a local one if it has been edited.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Data for a single part / Part data structure. Fields vary by part type: local/linked parts have stock and footprint; meta-parts have part-ids instead of stock; sub-assembly parts also have project-id.
    
    Map contents:
    
    *   `part/id` (string): Part id / UUID in 26-character compact form
        
    *   `part/type` (enum): Part type
        
        Possible values:
        
        "sub-assembly", "meta", "linked", "local"
        
    *   `part/name` (string): Part name (or local/internal part name if part is linked)
        
    *   `part/description` (string): Part description. In linked parts, this will be filled from linked data, unless edited locally.
        
    *   `part/notes` (string): This field stores your notes/comments regarding the part. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `part/footprint` (string):
        
    *   `part/manufacturer` (string): The name of the manufacturer. In linked parts, this is always the same as the linked part manufacturer.
        
    *   `part/mpn` (string): MPN: Manufacturer Part Number. In linked parts, this is always the same as the linked part MPN. In sub-assembly parts, this is always the same as the project name.
        
    *   `part/unit` (enum): Unit of measure for this part. When not set, the part is counted in pieces. Pass \`null\` to remove.
        
        Possible values:
        
        "cm", "dm", "ft", "in", "km", "m", "mi", "mil", "mm", "nm", "yd", "μm", "cm2", "dm2", "ft2", "in2", "km2", "m2", "mm2", "yd2", "g", "kg", "lb", "mg", "oz", "μg", "cm3", "dm3", "floz", "ft3", "gal", "in3", "l", "m3", "ml", "mm3", "μl", "day", "h", "min", "ms", "ns", "s", "μs"
        
    *   `part/package-quantity` (number): Package quantity: how many part-units come in one vendor purchase unit. Default 1. For parts without a unit, must be a whole number. Note that a minimum purchase amount is not a package quantity: for a part priced per piece that ships on a reel (e.g. 5000 resistors with a reel-sized MOQ), leave this at 1 — the reel size belongs in the offer's minimum order quantity.
        
    *   `part/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `part/stock`:
        
    *   `part/cad-keys` (array): A set of CAD keys that this part should be matched to
        
        Array element:
        
        (string): CAD key for matching to parts
        
    *   `part/low-stock` (map): Low stock levels
        
        Map contents:
        
        *   `report` (number): Include in the low-stock report when on-hand quantity is below this threshold, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
            
        
    *   `part/attrition` (map): Part attrition parameters
        
        Map contents:
        
        *   `percentage` (number): Percentage of parts wasted
            
        *   `quantity` (number): Minimum quantity wasted, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
            
        
    *   `part/custom-fields`:
        
    *   `part/default-storage-id` (string): Default storage location for this part. When adding stock, this location will be pre-selected. / Storage location id / UUID in 26-character compact form
        
    *   `part/default-storage-mandatory?` (boolean): When true, stock for this part must go to the default storage location.
        
    *   `part/part-ids` (array): A list of part ids
        
        Array element:
        
        (string): Part id / UUID in 26-character compact form
        
    *   `part/substitute-ids` (array): A list of part ids
        
        Array element:
        
        (string): Part id / UUID in 26-character compact form
        
    *   `part/project-id` (string): ID of the associated project (for sub-assembly parts only) / UUID in 26-character compact form
        
    *   `part/linked-id` (string): ID of the linked part data (for linked parts only) / UUID in 26-character compact form
        
    *   `part/attachments` (array): List of attachments for this part
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/all

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data` (array): Data for all parts
    
    Array element:
    
    (map): Part data structure. Fields vary by part type: local/linked parts have stock and footprint; meta-parts have part-ids instead of stock; sub-assembly parts also have project-id.
    
    Map contents:
    
    *   `part/id` (string): Part id / UUID in 26-character compact form
        
    *   `part/type` (enum): Part type
        
        Possible values:
        
        "sub-assembly", "meta", "linked", "local"
        
    *   `part/name` (string): Part name (or local/internal part name if part is linked)
        
    *   `part/description` (string): Part description. In linked parts, this will be filled from linked data, unless edited locally.
        
    *   `part/notes` (string): This field stores your notes/comments regarding the part. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `part/footprint` (string):
        
    *   `part/manufacturer` (string): The name of the manufacturer. In linked parts, this is always the same as the linked part manufacturer.
        
    *   `part/mpn` (string): MPN: Manufacturer Part Number. In linked parts, this is always the same as the linked part MPN. In sub-assembly parts, this is always the same as the project name.
        
    *   `part/unit` (enum): Unit of measure for this part. When not set, the part is counted in pieces. Pass \`null\` to remove.
        
        Possible values:
        
        "cm", "dm", "ft", "in", "km", "m", "mi", "mil", "mm", "nm", "yd", "μm", "cm2", "dm2", "ft2", "in2", "km2", "m2", "mm2", "yd2", "g", "kg", "lb", "mg", "oz", "μg", "cm3", "dm3", "floz", "ft3", "gal", "in3", "l", "m3", "ml", "mm3", "μl", "day", "h", "min", "ms", "ns", "s", "μs"
        
    *   `part/package-quantity` (number): Package quantity: how many part-units come in one vendor purchase unit. Default 1. For parts without a unit, must be a whole number. Note that a minimum purchase amount is not a package quantity: for a part priced per piece that ships on a reel (e.g. 5000 resistors with a reel-sized MOQ), leave this at 1 — the reel size belongs in the offer's minimum order quantity.
        
    *   `part/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `part/stock`:
        
    *   `part/cad-keys` (array): A set of CAD keys that this part should be matched to
        
        Array element:
        
        (string): CAD key for matching to parts
        
    *   `part/low-stock` (map): Low stock levels
        
        Map contents:
        
        *   `report` (number): Include in the low-stock report when on-hand quantity is below this threshold, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
            
        
    *   `part/attrition` (map): Part attrition parameters
        
        Map contents:
        
        *   `percentage` (number): Percentage of parts wasted
            
        *   `quantity` (number): Minimum quantity wasted, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
            
        
    *   `part/custom-fields`:
        
    *   `part/default-storage-id` (string): Default storage location for this part. When adding stock, this location will be pre-selected. / Storage location id / UUID in 26-character compact form
        
    *   `part/default-storage-mandatory?` (boolean): When true, stock for this part must go to the default storage location.
        
    *   `part/part-ids` (array): A list of part ids
        
        Array element:
        
        (string): Part id / UUID in 26-character compact form
        
    *   `part/substitute-ids` (array): A list of part ids
        
        Array element:
        
        (string): Part id / UUID in 26-character compact form
        
    *   `part/project-id` (string): ID of the associated project (for sub-assembly parts only) / UUID in 26-character compact form
        
    *   `part/linked-id` (string): ID of the linked part data (for linked parts only) / UUID in 26-character compact form
        
    *   `part/attachments` (array): List of attachments for this part
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/create

Create a new part

This can only be used to create local parts or meta-parts (e.g. you can't create a sub-assembly part directly). To create a linked part, you will need to create a local part first then use the UI to link it manually. Altium-related parameters require the Altium feature to be enabled.

###### Parameters

`part/type` (enum): Part type

Possible values:

"sub-assembly", "meta", "linked", "local"

`part/name` (string): Part name (or local/internal part name if part is linked)

`[optional] part/description` (string): Part description. In linked parts, this will be filled from linked data, unless edited locally.

`[optional] part/notes` (string): This field stores your notes/comments regarding the part. Markdown syntax is supported and links will be automatically highlighted.

`[optional] part/footprint` (string):

`[optional] part/unit` (enum): Unit of measure for this part. When not set, the part is counted in pieces. Pass \`null\` to remove.

Possible values:

"cm", "dm", "ft", "in", "km", "m", "mi", "mil", "mm", "nm", "yd", "μm", "cm2", "dm2", "ft2", "in2", "km2", "m2", "mm2", "yd2", "g", "kg", "lb", "mg", "oz", "μg", "cm3", "dm3", "floz", "ft3", "gal", "in3", "l", "m3", "ml", "mm3", "μl", "day", "h", "min", "ms", "ns", "s", "μs"

`[optional] part/package-quantity` (number): Package quantity: how many part-units come in one vendor purchase unit. Default 1. For parts without a unit, must be a whole number. Note that a minimum purchase amount is not a package quantity: for a part priced per piece that ships on a reel (e.g. 5000 resistors with a reel-sized MOQ), leave this at 1 — the reel size belongs in the offer's minimum order quantity.

`[optional] part/tags` (array): A list of tags

Array element:

(string): Tag

`[optional] part/attrition` (map): Part attrition parameters

Map contents:

*   `percentage` (number): Percentage of parts wasted
    
*   `quantity` (number): Minimum quantity wasted, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    

`[optional] part/low-stock` (map): Low stock levels

Map contents:

*   `report` (number): Include in the low-stock report when on-hand quantity is below this threshold, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    

`[optional] part/cad-keys` (array): A set of CAD keys that this part should be matched to

Array element:

(string): CAD key for matching to parts

`[optional] part/custom-fields`:

`[optional] part/default-storage-id` (string): Default storage location for this part. When adding stock, this location will be pre-selected. / Storage location id / UUID in 26-character compact form

`[optional] part/default-storage-mandatory?` (boolean): When true, stock for this part must go to the default storage location.

`[optional] part/kicad-symbol` (string): Name of the symbol in the KiCad symbol library, for example "Device:R".

`[optional] part/kicad-footprint` (string): Name of the footprint in the KiCad footprint library, for example "Capacitor\_SMD:C\_0603\_1608Metric".

`[optional] part/kicad-reference` (string): Symbol reference, usually one character (for example "C"), used to build references like C4, R12, U1, etc.

`[optional] part/altium-library-ref` (string): Schematic symbol library reference

`[optional] part/altium-library-path` (string): Schematic symbol library path

`[optional] part/altium-footprint-ref` (string): PCB footprint reference associated with this part in Altium

`[optional] part/altium-footprint-path` (string): PCB footprint library path for part in Altium

`[optional] part/altium-footprint-ref-2` (string): Alternative footprint reference. Multiple alternative footprints can be added.

`[optional] part/altium-footprint-path-2` (string): PCB footprint library path for part in Altium

`[optional] part/altium-footprint-ref-3` (string): Alternative footprint reference. Multiple alternative footprints can be added.

`[optional] part/altium-footprint-path-3` (string): PCB footprint library path for part in Altium

###### Return value

(map):

Map contents:

*   `data` (map): Contains the newly created part id
    
    Map contents:
    
    *   `part/id` (string): Part id / UUID in 26-character compact form
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/update

Update data for a part

Altium-related parameters require the Altium feature to be enabled.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`[optional] part/name` (string): Part name (or local/internal part name if part is linked)

`[optional] part/description` (string): Part description. In linked parts, this will be filled from linked data, unless edited locally.

`[optional] part/notes` (string): This field stores your notes/comments regarding the part. Markdown syntax is supported and links will be automatically highlighted.

`[optional] part/footprint` (string):

`[optional] part/package-quantity` (number): Package quantity: how many part-units come in one vendor purchase unit. Default 1. For parts without a unit, must be a whole number. Note that a minimum purchase amount is not a package quantity: for a part priced per piece that ships on a reel (e.g. 5000 resistors with a reel-sized MOQ), leave this at 1 — the reel size belongs in the offer's minimum order quantity.

`[optional] part/tags` (array): A list of tags

Array element:

(string): Tag

`[optional] part/attrition` (map): Part attrition parameters

Map contents:

*   `percentage` (number): Percentage of parts wasted
    
*   `quantity` (number): Minimum quantity wasted, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    

`[optional] part/low-stock` (map): Low stock levels

Map contents:

*   `report` (number): Include in the low-stock report when on-hand quantity is below this threshold, in the part's unit of measure. A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    

`[optional] part/cad-keys` (array): A set of CAD keys that this part should be matched to

Array element:

(string): CAD key for matching to parts

`[optional] part/custom-fields`:

`[optional] part/spec-overrides`:

`[optional] part/default-storage-id` (string): Default storage location for this part. When adding stock, this location will be pre-selected. / Storage location id / UUID in 26-character compact form

`[optional] part/default-storage-mandatory?` (boolean): When true, stock for this part must go to the default storage location.

`[optional] part/kicad-symbol` (string): Name of the symbol in the KiCad symbol library, for example "Device:R".

`[optional] part/kicad-footprint` (string): Name of the footprint in the KiCad footprint library, for example "Capacitor\_SMD:C\_0603\_1608Metric".

`[optional] part/kicad-reference` (string): Symbol reference, usually one character (for example "C"), used to build references like C4, R12, U1, etc.

`[optional] part/altium-library-ref` (string): Schematic symbol library reference

`[optional] part/altium-library-path` (string): Schematic symbol library path

`[optional] part/altium-footprint-ref` (string): PCB footprint reference associated with this part in Altium

`[optional] part/altium-footprint-path` (string): PCB footprint library path for part in Altium

`[optional] part/altium-footprint-ref-2` (string): Alternative footprint reference. Multiple alternative footprints can be added.

`[optional] part/altium-footprint-path-2` (string): PCB footprint library path for part in Altium

`[optional] part/altium-footprint-ref-3` (string): Alternative footprint reference. Multiple alternative footprints can be added.

`[optional] part/altium-footprint-path-3` (string): PCB footprint library path for part in Altium

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/update-spec-overrides

Update spec overrides for a part

Set or update specification overrides. Overrides are merged with any existing overrides. Each spec override is a map with the spec key as key and a value structure matching the spec type: `{:v <value>}` for text/float/integer specs, `{:minv <number> :maxv <number>}` for interval specs. Only known spec keys from the specs dictionary are accepted.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`spec-overrides`:

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/delete-spec-override

Delete a single spec override from a part

Removes a spec override, reverting to the original value (for linked parts) or removing the spec entirely (for local parts).

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`spec-key`:

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/assign-unit

Assign, change, or remove a part's unit of measure

Sets or removes the unit of measure for a part. By default the part must be standalone: it must have no stock history, no project or list entry references, no order entry references, and must not be referenced as a substitute or meta-part member. Pass `null` for `:part/unit` to remove the unit. Sub-assembly parts cannot have their unit changed (they are always counted in pieces). Meta-parts can have their unit assigned or changed, subject to member-category compatibility: the new unit's category must match every current member's `:part/unit` category. A meta-part with no members has no member constraint to satisfy. A part with substitutes of its own is constrained symmetrically: the new unit's category must match every substitute's `:part/unit` category, so the unit can only change within the same measurement category, and a unitless part with substitutes cannot gain a unit.

Pass `reinterpret?: true` to allow a unit change on a part with stock history or `:entry/part-id` references. Stored numeric values are relabeled under the new unit — no values change. This covers three cases symmetrically: assigning the first unit to a part that previously had none, switching between two units, and clearing the unit back to pieces (set `:part/unit` to null). Reinterpretation still rejects parts referenced by order entries, parts referenced as substitutes (in other parts or in entries), and parts that are members of a meta-part — those relationships must be removed first. The member and substitute category constraints apply under reinterpretation as well.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`[optional] part/unit` (enum): Unit of measure for this part. When not set, the part is counted in pieces. Pass \`null\` to remove.

Possible values:

"cm", "dm", "ft", "in", "km", "m", "mi", "mil", "mm", "nm", "yd", "μm", "cm2", "dm2", "ft2", "in2", "km2", "m2", "mm2", "yd2", "g", "kg", "lb", "mg", "oz", "μg", "cm3", "dm3", "floz", "ft3", "gal", "in3", "l", "m3", "ml", "mm3", "μl", "day", "h", "min", "ms", "ns", "s", "μs"

`[optional] reinterpret?` (boolean): Allow the unit change on a part with stock or entry references; existing quantities are relabeled, not rewritten.

###### Return value

(map):

Map contents:

*   `data` (map):
    
    Map contents:
    
    *   `part/id` (string): Part id / UUID in 26-character compact form
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/delete

Delete a part

This is a dangerous operation, as it affects build histories, past orders and your stock history. Do not delete parts that are used in projects.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/set-image

Set the primary thumbnail image for a part

Uploads an image and sets it as the part's primary thumbnail. The request must use multipart/form-data encoding. The endpoint is `/api/1/part/set-image`. The image is resized server-side; the response contains the resulting image file ID. Setting a new image replaces any previous one.

Example:

```
curl -X POST \
  -H 'Authorization: APIKey partsboxapi_...' \
  -F 'file=@image.png' \
  -F 'part/id=1pbvre0cfg4f58azmvsgetasxq' \
  https://api.partsbox.com/api/1/part/set-image
```


###### Parameters

`file` (The image file to upload (multipart form field)):

`part/id` (string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map):
    
    Map contents:
    
    *   `part/id` (string): Part id / UUID in 26-character compact form
        
    *   `part/img-id` (string): ID of the part's primary thumbnail image file / UUID in 26-character compact form
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/delete-image

Remove the primary thumbnail image from a part

Removes the part's primary thumbnail image. Returns `not-found` if the part does not have a custom image set.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map):
    
    Map contents:
    
    *   `part/id` (string): Part id / UUID in 26-character compact form
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/add-meta-part-ids

Add member parts (equivalent substitutes) to a meta-part

Each member part's unit category must match the meta-part's unit category. When the first member is added to a meta-part that has no unit and no members, and that member has a unit of measure, the meta-part's unit is set from that member. This implicit unit assignment fails with a `conflict` status if the meta-part is referenced by project or list entries, is referenced as a substitute, or has a low stock level set — in that case, assign the unit explicitly with `part/assign-unit` first.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`part/part-ids` (array): A list of part ids

Array element:

(string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/remove-meta-part-ids

Remove member parts from a meta-part

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`part/part-ids` (array): A list of part ids

Array element:

(string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/add-substitute-ids

Add substitutes to a part

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`part/substitute-ids` (array): A list of part ids

Array element:

(string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/remove-substitute-ids

Remove substitutes from a part

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`part/part-substitute-ids`:

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/update-custom-fields

Update (possibly creating) custom fields for a part. OBSOLETE: do not use. Use custom-field/update instead.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`custom-fields` (array): A list of custom fields to create or update

Array element:

(map): Custom field, consisting of a key and value

Map contents:

*   `key` (string): Custom field key, limited to 256 characters
    
*   `value` (string): Custom field value, limited to 1024 characters
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/delete-custom-field

Delete a custom field from a part. OBSOLETE: do not use. Use custom-field/delete instead.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`custom-field-key` (string): Custom field key, limited to 256 characters

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/storage

Return a list of sources for a part (aggregating lots)

Returns a list of sources for a part. If multiple lots exist for a part, they will be aggregated so that the total stock for this part in each storage location is returned.

This answers the question: "where is this part stored?" by looking at the stock history and returning sources, aggregating lots so that every storage location for a part appears only once.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of part sources
    
    Array element:
    
    (map): A source of parts. Summarizes available stock. When used as a parameter, specifies where stock is to be taken from using \`source/part-id\`, \`source/storage-id\`, and \`source/lot-id\`. With lot control enabled, \`source/lot-id\` is required to identify the specific lot.
    
    Map contents:
    
    *   `source/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `source/storage-id` (string): Storage location id / UUID in 26-character compact form
        
    *   `[optional] source/lot-id` (string): Lot id / UUID in 26-character compact form
        
    *   `[optional] source/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
        
    *   `[optional] source/status` (enum): Stock status, no status means on-hand stock.
        
        Possible values:
        
        "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
        
    *   `[optional] source/first-timestamp` (64-bit UNIX timestamp in UTC time zone): First (oldest) timestamp of stock entries summarized by this source
        
    *   `[optional] source/last-timestamp` (64-bit UNIX timestamp in UTC time zone): Last (most recent) timestamp of stock entries summarized by this source
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/lots

Return a list of sources for a part

Returns a list of sources for a part, including every lot as a separate source.

This will produce a list of all lots for stock of this part, with their current quantities.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of part sources
    
    Array element:
    
    (map): A source of parts. Summarizes available stock. When used as a parameter, specifies where stock is to be taken from using \`source/part-id\`, \`source/storage-id\`, and \`source/lot-id\`. With lot control enabled, \`source/lot-id\` is required to identify the specific lot.
    
    Map contents:
    
    *   `source/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `source/storage-id` (string): Storage location id / UUID in 26-character compact form
        
    *   `[optional] source/lot-id` (string): Lot id / UUID in 26-character compact form
        
    *   `[optional] source/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
        
    *   `[optional] source/status` (enum): Stock status, no status means on-hand stock.
        
        Possible values:
        
        "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
        
    *   `[optional] source/first-timestamp` (64-bit UNIX timestamp in UTC time zone): First (oldest) timestamp of stock entries summarized by this source
        
    *   `[optional] source/last-timestamp` (64-bit UNIX timestamp in UTC time zone): Last (most recent) timestamp of stock entries summarized by this source
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### part/stock

Return the total stock count for a part

Returns the total stock count for the specified part. If optional `storage/id` is supplied, will only return the stock count for inventory in that storage location.

###### Parameters

`part/id` (string): Part id / UUID in 26-character compact form

`[optional] storage/id` (string): Storage location id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Contains the stock count
    
    Map contents:
    
    *   `source/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
        
    
*   `source/quantity`: DEPRECATED: use data/source/quantity instead
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Stock
-----

Stock history for parts is stored as a list of timestamped stock entries. Every stock entry has a quantity and a timestamp, but pricing information is optional.

Warning: work on features like stock allocations, reservations and planned builds is already in progress. This means that in the near future stock entries will have a `stock/status` field and will not always represent the stock that is on-hand and available.

PartsBox does not store the total stock count anywhere. In order to get stock counts, you need to go through stock history and calculate them, or use the provided API functions. However, please do not assume that you can simply use the sum of `stock/quantity` fields. After stock statuses are introduced, this will conflate stock that is on-hand with stock that has been ordered, allocated or held. You will need to compute totals for each status separately.

It is recommended to use the provided API functions for calculating/summarizing stock.

### stock/add

Add stock for a part.

When lot control is enabled, a new lot is automatically created for every stock addition. If you pass in optional lot data, it will be used to populate the new lot's fields (name, description, comments, expiration date, tags). If you don't provide lot data, the lot will still be created with default values.

Note that some parameters might not be available, depending on the features in your plan.

If you pass in order data, an order will be created. You can also link this stock to an existing order by passing `stock/order-id`. For stock that is linked to orders, `stock/vendor-sku` is mandatory.

If you add a price, then currency becomes mandatory as well.

###### Parameters

`stock/part-id` (string): Part id / UUID in 26-character compact form

`stock/storage-id` (string): Storage location id / UUID in 26-character compact form

`stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.

`stock/comments` (string): Comments for this stock entry

`[optional] stock/price` (number): Price per part unit (the unit chosen for the part via \`:part/unit\`); for parts without a unit, price per piece. This is the regime both when supplying a price (e.g. \`stock/add\`) and when reading one back, including the stock entries that orders return.

`[optional] stock/currency` (enum):

Possible values:

"bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"

`[optional] stock/order-id` (string): Order that this stock entry belongs to / Order id / UUID in 26-character compact form

`[optional] stock/vendor-sku` (string): For stock ordered from a distributor, the vendor SKU that was ordered

`[optional] order` (map): Information about the newly created order

Map contents:

*   `order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
    
*   `order/vendor-name` (string): The name of the vendor/distributor
    
*   `order/number` (string): Vendor/distributor order number (as assigned by the vendor)
    
*   `order/invoice-number` (string): Vendor/distributor invoice number
    
*   `order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
    
*   `order/comments` (string): Your comments for this order
    
*   `order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
    
*   `order/tags` (array): A list of tags
    
    Array element:
    
    (string): Tag
    
*   `order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
    

`[optional] lot` (map): Information about the newly created lot

Map contents:

*   `lot/created` (64-bit UNIX timestamp in UTC time zone): The date when this lot was created.
    
*   `lot/name` (string): Lot name or number as defined within the company. A lot represents a specific batch of parts and can have data associated with it. Assigning a lot name is not mandatory: PartsBox automatically generates unique IDs for every lot.
    
*   `lot/description` (string): A short optional description of the lot.
    
*   `lot/comments` (string): Any other comments that will be stored with this lot.
    
*   `lot/expiration-date` (64-bit UNIX timestamp in UTC time zone): Date when this lot expires
    
*   `lot/tags` (array): A list of tags
    
    Array element:
    
    (string): Tag
    
*   `lot/order-id` (string): Order id / UUID in 26-character compact form
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### stock/remove

Remove stock from a specified source

Stock sources are identified by part id, storage id, and (in plans with lot control) lot id. Quantity is a positive integer: the number of parts to remove.

###### Parameters

`stock/source` (map): A source of parts. Summarizes available stock. When used as a parameter, specifies where stock is to be taken from using \`source/part-id\`, \`source/storage-id\`, and \`source/lot-id\`. With lot control enabled, \`source/lot-id\` is required to identify the specific lot.

Map contents:

*   `source/part-id` (string): Part id / UUID in 26-character compact form
    
*   `source/storage-id` (string): Storage location id / UUID in 26-character compact form
    
*   `[optional] source/lot-id` (string): Lot id / UUID in 26-character compact form
    
*   `[optional] source/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    
*   `[optional] source/status` (enum): Stock status, no status means on-hand stock.
    
    Possible values:
    
    "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
    
*   `[optional] source/first-timestamp` (64-bit UNIX timestamp in UTC time zone): First (oldest) timestamp of stock entries summarized by this source
    
*   `[optional] source/last-timestamp` (64-bit UNIX timestamp in UTC time zone): Last (most recent) timestamp of stock entries summarized by this source
    

`stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.

`[optional] stock/comments` (string): Comments for this stock entry

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### stock/move

Move stock to a different storage location

Move stock to a different storage location. When lot control is enabled, `source/lot-id` must be specified to identify which lot to move from. Use the `part/lots` API to retrieve available lots for a part. If `split-lot?` is true, allows for lot splitting, and information for the newly created lot can be provided. The new lot will keep a reference to the previous lot, so that tracking is possible. The newly created lot id will be returned in the response.

###### Parameters

`stock/source` (map): A source of parts. Summarizes available stock. When used as a parameter, specifies where stock is to be taken from using \`source/part-id\`, \`source/storage-id\`, and \`source/lot-id\`. With lot control enabled, \`source/lot-id\` is required to identify the specific lot.

Map contents:

*   `source/part-id` (string): Part id / UUID in 26-character compact form
    
*   `source/storage-id` (string): Storage location id / UUID in 26-character compact form
    
*   `[optional] source/lot-id` (string): Lot id / UUID in 26-character compact form
    
*   `[optional] source/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    
*   `[optional] source/status` (enum): Stock status, no status means on-hand stock.
    
    Possible values:
    
    "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
    
*   `[optional] source/first-timestamp` (64-bit UNIX timestamp in UTC time zone): First (oldest) timestamp of stock entries summarized by this source
    
*   `[optional] source/last-timestamp` (64-bit UNIX timestamp in UTC time zone): Last (most recent) timestamp of stock entries summarized by this source
    

`stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.

`stock/comments` (string): Comments for this stock entry

`stock/storage-id` (string): Storage location id / UUID in 26-character compact form

`[optional] split-lot?` (boolean):

`[optional] lot` (map): Information about the newly created lot

Map contents:

*   `lot/created` (64-bit UNIX timestamp in UTC time zone): The date when this lot was created.
    
*   `lot/name` (string): Lot name or number as defined within the company. A lot represents a specific batch of parts and can have data associated with it. Assigning a lot name is not mandatory: PartsBox automatically generates unique IDs for every lot.
    
*   `lot/description` (string): A short optional description of the lot.
    
*   `lot/comments` (string): Any other comments that will be stored with this lot.
    
*   `lot/tags` (array): A list of tags
    
    Array element:
    
    (string): Tag
    
*   `lot/expiration-date` (64-bit UNIX timestamp in UTC time zone): Date when this lot expires
    

###### Return value

(map):

Map contents:

*   `data` (map): Contains the new lot id when a lot split occurs
    
    Map contents:
    
    *   `lot/id` (string): Lot id / UUID in 26-character compact form
        
    
*   `lot/id`: DEPRECATED: use data/lot/id instead
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### stock/update

Update a stock entry

Stock entries are identified by `stock/part-id` and `stock/timestamp`, so these fields are mandatory. Note that updating `stock/quantity` in historical stock entries is dangerous and can lead to permanent database breakage — if you have an add-stock entry for 100pcs, and later remove 100pcs, modifying the quantity in the add-stock entry to 50pcs will result in negative stock. PartsBox does its best to prevent you from shooting yourself in the foot, but it cannot detect every possible problem. It is highly recommended to only modify `stock/quantity` in the latest entry in a stock history for a part. Stock removal entries store negative quantities, so when correcting such an entry, supply the new quantity as a negative number.

Omitting an optional field leaves its current value unchanged. To clear an optional field, send it as `null`. For example, sending `stock/price` as `null` removes the price from the entry; a stock entry with no price is excluded from the part's weighted-average cost.

###### Parameters

`stock/part-id` (string): Part id / UUID in 26-character compact form

`stock/timestamp` (64-bit UNIX timestamp in UTC time zone): Timestamp when stock entry was created

`[optional] stock/comments` (string): Comments for this stock entry

`[optional] stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.

`[optional] stock/price` (number): Price per part unit (the unit chosen for the part via \`:part/unit\`); for parts without a unit, price per piece. This is the regime both when supplying a price (e.g. \`stock/add\`) and when reading one back, including the stock entries that orders return.

`[optional] stock/currency` (enum):

Possible values:

"bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Lots
----

### lot/get

Get single lot data

This will return data for a single lot identified by a lot id.

###### Parameters

`lot/id` (string): Lot id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Data for a single lot / Lot information
    
    Map contents:
    
    *   `lot/id` (string): Lot id / UUID in 26-character compact form
        
    *   `lot/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `lot/created` (64-bit UNIX timestamp in UTC time zone): The date when this lot was created.
        
    *   `lot/name` (string): Lot name or number as defined within the company. A lot represents a specific batch of parts and can have data associated with it. Assigning a lot name is not mandatory: PartsBox automatically generates unique IDs for every lot.
        
    *   `lot/description` (string): A short optional description of the lot.
        
    *   `lot/comments` (string): Any other comments that will be stored with this lot.
        
    *   `lot/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `lot/expiration-date` (64-bit UNIX timestamp in UTC time zone): Date when this lot expires
        
    *   `lot/order-id` (string): Order id / UUID in 26-character compact form
        
    *   `lot/build-id` (string): Build id / UUID in 26-character compact form
        
    *   `lot/previous-id` (string): The lot that this one was created from by splitting. If the original lot was created by a build, build information is shown in the Builds tab. / UUID in 26-character compact form
        
    *   `lot/custom-fields`:
        
    *   `lot/attachments` (array): List of attachments for this lot
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### lot/update

Update single lot data

###### Parameters

`lot/id` (string): Lot id / UUID in 26-character compact form

`[optional] lot/created` (64-bit UNIX timestamp in UTC time zone): The date when this lot was created.

`[optional] lot/name` (string): Lot name or number as defined within the company. A lot represents a specific batch of parts and can have data associated with it. Assigning a lot name is not mandatory: PartsBox automatically generates unique IDs for every lot.

`[optional] lot/description` (string): A short optional description of the lot.

`[optional] lot/comments` (string): Any other comments that will be stored with this lot.

`[optional] lot/expiration-date` (64-bit UNIX timestamp in UTC time zone): Date when this lot expires

`[optional] lot/tags` (array): A list of tags

Array element:

(string): Tag

`[optional] lot/custom-fields`:

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### lot/all

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data` (array): Data for all lots
    
    Array element:
    
    (map): Lot information
    
    Map contents:
    
    *   `lot/id` (string): Lot id / UUID in 26-character compact form
        
    *   `lot/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `lot/created` (64-bit UNIX timestamp in UTC time zone): The date when this lot was created.
        
    *   `lot/name` (string): Lot name or number as defined within the company. A lot represents a specific batch of parts and can have data associated with it. Assigning a lot name is not mandatory: PartsBox automatically generates unique IDs for every lot.
        
    *   `lot/description` (string): A short optional description of the lot.
        
    *   `lot/comments` (string): Any other comments that will be stored with this lot.
        
    *   `lot/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `lot/expiration-date` (64-bit UNIX timestamp in UTC time zone): Date when this lot expires
        
    *   `lot/order-id` (string): Order id / UUID in 26-character compact form
        
    *   `lot/build-id` (string): Build id / UUID in 26-character compact form
        
    *   `lot/previous-id` (string): The lot that this one was created from by splitting. If the original lot was created by a build, build information is shown in the Builds tab. / UUID in 26-character compact form
        
    *   `lot/custom-fields`:
        
    *   `lot/attachments` (array): List of attachments for this lot
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Storage
-------

### storage/get

Get data for a single storage location

###### Parameters

`storage/id` (string): Storage location id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Data for a single storage location / Storage location data
    
    Map contents:
    
    *   `storage/id` (string): Storage location id / UUID in 26-character compact form
        
    *   `storage/name` (string): Storage location name
        
    *   `storage/description` (string): Storage location description
        
    *   `storage/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `storage/custom-fields` (array): Custom fields for this storage location / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `storage/attachments` (array): List of attachments for this storage location
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/all

Get data for all storage locations

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data` (array): A list with data for all storage locations
    
    Array element:
    
    (map): Storage location data
    
    Map contents:
    
    *   `storage/id` (string): Storage location id / UUID in 26-character compact form
        
    *   `storage/name` (string): Storage location name
        
    *   `storage/description` (string): Storage location description
        
    *   `storage/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `storage/custom-fields` (array): Custom fields for this storage location / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `storage/attachments` (array): List of attachments for this storage location
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/create

Create a new storage location

Creates a new storage location with the given name. The name must be unique within your database. Description, tags, and custom fields are optional.

###### Parameters

`storage/name` (string): Storage location name

`[optional] storage/description` (string): Storage location description

`[optional] storage/tags` (array): A list of tags

Array element:

(string): Tag

`[optional] storage/custom-fields` (array): Custom fields for this storage location / A list of custom fields to create or update

Array element:

(map): Custom field, consisting of a key and value

Map contents:

*   `key` (string): Custom field key, limited to 256 characters
    
*   `value` (string): Custom field value, limited to 1024 characters
    

###### Return value

(map):

Map contents:

*   `data` (map): Contains the newly created storage location id
    
    Map contents:
    
    *   `storage/id` (string): Storage location id / UUID in 26-character compact form
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/update

Update data for a storage location

Only description, tags, and custom fields can be updated, see also `storage/rename` and `storage/change-settings`.

###### Parameters

`storage/id` (string): Storage location id / UUID in 26-character compact form

`[optional] storage/description` (string): Storage location description

`[optional] storage/tags` (array): A list of tags

Array element:

(string): Tag

`[optional] storage/custom-fields` (array): Custom fields for this storage location / A list of custom fields to create or update

Array element:

(map): Custom field, consisting of a key and value

Map contents:

*   `key` (string): Custom field key, limited to 256 characters
    
*   `value` (string): Custom field value, limited to 1024 characters
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/rename

Change the name of a storage location

Renaming a storage location might fail if there is already another location with the same target name.

###### Parameters

`storage/id` (string): Storage location id / UUID in 26-character compact form

`storage/name` (string): Storage location name

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/change-settings

Change settings for a storage location

Given a list of storage location ids, will attempt to set the parameter supplied as `param` to the boolean `value`.

There are three possible parameters. Single-part: This location will only accept one part and will not appear when adding stock for other parts than the one already stored. Useful for nuts, bolts, washers, or small drawers containing only a single type of component. Existing parts only: this location will only accept stock for parts which are already stored there, and will not appear when adding stock for other parts. Full: this location will not accept any new stock and will never appear when adding stock. Example: `{"ids":["1pbr32mcfg4f59azmvsyetqsxq"],"param":"storage/full?","value":true}`

###### Parameters

`ids` (array): A list of storage location ids that should have settings changed

Array element:

(string): Storage location id / UUID in 26-character compact form

`param` (enum): Parameter (setting) for a storage location

Possible values:

"storage/full?", "storage/single-part?", "storage/existing-parts-only?"

`value` (boolean): \`true\` or \`false\`

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/archive

Archive a storage location

Archiving a storage location makes it not show up in normal usage. History for parts that used to be stored in this location will show the location name and you will be able to access this archived location through direct links or by going to the archived location list. You will also be able to un-archive (restore) the location. Do this for storage locations that you will not use anymore, but would like to remember.

###### Parameters

`storage/id` (string): Storage location id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/restore

Restore an archived storage location

This storage location will be restored (un-archived) and will behave like a normal storage location again.

###### Parameters

`storage/id` (string): Storage location id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/parts

Return a list of part sources in a storage location (aggregating lots)

Calculates the stock of parts in a given storage location and returns a list of part sources. If multiple lots exist for a part, they will be aggregated so that the total per-part stock is returned.

###### Parameters

`storage/id` (string): Storage location id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of part sources
    
    Array element:
    
    (map): A source of parts. Summarizes available stock. When used as a parameter, specifies where stock is to be taken from using \`source/part-id\`, \`source/storage-id\`, and \`source/lot-id\`. With lot control enabled, \`source/lot-id\` is required to identify the specific lot.
    
    Map contents:
    
    *   `source/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `source/storage-id` (string): Storage location id / UUID in 26-character compact form
        
    *   `[optional] source/lot-id` (string): Lot id / UUID in 26-character compact form
        
    *   `[optional] source/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
        
    *   `[optional] source/status` (enum): Stock status, no status means on-hand stock.
        
        Possible values:
        
        "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
        
    *   `[optional] source/first-timestamp` (64-bit UNIX timestamp in UTC time zone): First (oldest) timestamp of stock entries summarized by this source
        
    *   `[optional] source/last-timestamp` (64-bit UNIX timestamp in UTC time zone): Last (most recent) timestamp of stock entries summarized by this source
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### storage/lots

Return a list of part sources in a storage location (lots not aggregated)

Calculates the stock of parts in a given storage location and returns a list of part sources. If multiple lots exist for a part, they will all be returned, each as an individual source.

###### Parameters

`storage/id` (string): Storage location id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of part sources
    
    Array element:
    
    (map): A source of parts. Summarizes available stock. When used as a parameter, specifies where stock is to be taken from using \`source/part-id\`, \`source/storage-id\`, and \`source/lot-id\`. With lot control enabled, \`source/lot-id\` is required to identify the specific lot.
    
    Map contents:
    
    *   `source/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `source/storage-id` (string): Storage location id / UUID in 26-character compact form
        
    *   `[optional] source/lot-id` (string): Lot id / UUID in 26-character compact form
        
    *   `[optional] source/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
        
    *   `[optional] source/status` (enum): Stock status, no status means on-hand stock.
        
        Possible values:
        
        "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
        
    *   `[optional] source/first-timestamp` (64-bit UNIX timestamp in UTC time zone): First (oldest) timestamp of stock entries summarized by this source
        
    *   `[optional] source/last-timestamp` (64-bit UNIX timestamp in UTC time zone): Last (most recent) timestamp of stock entries summarized by this source
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Projects
--------

### project/get

Get data for a single project

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Data for a single project / Complete project data structure
    
    Map contents:
    
    *   `project/id` (string): Project id / UUID in 26-character compact form
        
    *   `project/name` (string): Project name
        
    *   `project/description` (string): Project description
        
    *   `project/notes` (string): Longer-form project notes (can use Markdown)
        
    *   `project/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `project/custom-fields` (array): Custom fields for this project / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `project/attachments` (array): List of attachments for this project
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/all

Get data for all projects

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data` (array): A list with data for all projects
    
    Array element:
    
    (map): Complete project data structure
    
    Map contents:
    
    *   `project/id` (string): Project id / UUID in 26-character compact form
        
    *   `project/name` (string): Project name
        
    *   `project/description` (string): Project description
        
    *   `project/notes` (string): Longer-form project notes (can use Markdown)
        
    *   `project/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `project/custom-fields` (array): Custom fields for this project / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `project/attachments` (array): List of attachments for this project
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/create

Create a new project, optionally also adding entries

###### Parameters

`project/name` (string): Project name

`[optional] project/description` (string): Project description

`[optional] project/notes` (string): Longer-form project notes (can use Markdown)

`[optional] project/custom-fields` (array): Custom fields for this project / A list of custom fields to create or update

Array element:

(map): Custom field, consisting of a key and value

Map contents:

*   `key` (string): Custom field key, limited to 256 characters
    
*   `value` (string): Custom field value, limited to 1024 characters
    

`[optional] entries` (array):

Array element:

(map): An entry in a project/BOM

Map contents:

*   `entry/part-id` (string): Part id / UUID in 26-character compact form
    
*   `entry/substitute-ids` (array): A set of part ids that may be used as substitutes for the entry's primary part for this specific BOM
    
    Array element:
    
    (string): Part id / UUID in 26-character compact form
    
*   `entry/quantity` (number): Quantity for this project/BOM/list entry. Must be a non-negative integer for discrete parts, or a non-negative number for unit-based parts.
    
*   `entry/name` (string): A BOM name for this entry
    
*   `entry/comments` (string): Additional comments
    
*   `entry/designators` (array): Set of designators
    
    Array element:
    
    (string): Designator
    
*   `entry/order` (integer): Ordering within the BOM (future extension: entries will be sorted by this number)
    
*   `entry/cad-footprint` (string): Footprint from CAD program (currently unused)
    
*   `entry/cad-key` (string): CAD key for matching to parts
    
*   `entry/custom-fields`:
    

###### Return value

(map):

Map contents:

*   `data` (map): Contains the newly created project id
    
    Map contents:
    
    *   `project/id` (string): Project id / UUID in 26-character compact form
        
    
*   `project/id`: DEPRECATED: use data/project/id instead
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/update

Update project data

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`[optional] project/name` (string): Project name

`[optional] project/description` (string): Project description

`[optional] project/notes` (string): Longer-form project notes (can use Markdown)

`[optional] project/custom-fields` (array): Custom fields for this project / A list of custom fields to create or update

Array element:

(map): Custom field, consisting of a key and value

Map contents:

*   `key` (string): Custom field key, limited to 256 characters
    
*   `value` (string): Custom field value, limited to 1024 characters
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/create-sub-assembly-part

Create a sub-assembly part associated with a project

Creates a new sub-assembly part for the given project. The part's name and MPN are fixed to the project's name. Returns the new `part/id` in `data`. If the project already has a sub-assembly part associated with it, returns `status/conflict`.

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Contains the newly created sub-assembly part id
    
    Map contents:
    
    *   `part/id` (string): Part id / UUID in 26-character compact form
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/delete

Delete a project

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/get-entries

Get project entries, or entries for a specific project build

Returns either project entries (the current version of the project), or if `build/id` is also supplied, build entries for that particular build.

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`build/id` (string): Build id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of entries
    
    Array element:
    
    (map): An entry in a project/BOM
    
    Map contents:
    
    *   `entry/id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
        
    *   `entry/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `entry/substitute-ids` (array): A set of part ids that may be used as substitutes for the entry's primary part for this specific BOM
        
        Array element:
        
        (string): Part id / UUID in 26-character compact form
        
    *   `entry/quantity` (number): Quantity for this project/BOM/list entry. Must be a non-negative integer for discrete parts, or a non-negative number for unit-based parts.
        
    *   `entry/name` (string): A BOM name for this entry
        
    *   `entry/comments` (string): Additional comments
        
    *   `entry/designators` (array): Set of designators
        
        Array element:
        
        (string): Designator
        
    *   `entry/order` (integer): Ordering within the BOM (future extension: entries will be sorted by this number)
        
    *   `entry/cad-footprint` (string): Footprint from CAD program (currently unused)
        
    *   `entry/cad-key` (string): CAD key for matching to parts
        
    *   `entry/custom-fields`:
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/add-entries

Add entries to a project/BOM

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`entries` (array):

Array element:

(map): An entry in a project/BOM

Map contents:

*   `entry/part-id` (string): Part id / UUID in 26-character compact form
    
*   `entry/substitute-ids` (array): A set of part ids that may be used as substitutes for the entry's primary part for this specific BOM
    
    Array element:
    
    (string): Part id / UUID in 26-character compact form
    
*   `entry/quantity` (number): Quantity for this project/BOM/list entry. Must be a non-negative integer for discrete parts, or a non-negative number for unit-based parts.
    
*   `entry/name` (string): A BOM name for this entry
    
*   `entry/comments` (string): Additional comments
    
*   `entry/designators` (array): Set of designators
    
    Array element:
    
    (string): Designator
    
*   `entry/order` (integer): Ordering within the BOM (future extension: entries will be sorted by this number)
    
*   `entry/cad-footprint` (string): Footprint from CAD program (currently unused)
    
*   `entry/cad-key` (string): CAD key for matching to parts
    
*   `entry/custom-fields`:
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/update-entries

Update (modify) entries in a project/BOM

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`entries` (array):

Array element:

(map): An entry in a project/BOM

Map contents:

*   `entry/id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
    
*   `entry/part-id` (string): Part id / UUID in 26-character compact form
    
*   `entry/substitute-ids` (array): A set of part ids that may be used as substitutes for the entry's primary part for this specific BOM
    
    Array element:
    
    (string): Part id / UUID in 26-character compact form
    
*   `entry/quantity` (number): Quantity for this project/BOM/list entry. Must be a non-negative integer for discrete parts, or a non-negative number for unit-based parts.
    
*   `entry/name` (string): A BOM name for this entry
    
*   `entry/comments` (string): Additional comments
    
*   `entry/designators` (array): Set of designators
    
    Array element:
    
    (string): Designator
    
*   `entry/order` (integer): Ordering within the BOM (future extension: entries will be sorted by this number)
    
*   `entry/cad-footprint` (string): Footprint from CAD program (currently unused)
    
*   `entry/cad-key` (string): CAD key for matching to parts
    
*   `entry/custom-fields`:
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/delete-entries

Delete entries in a project/BOM

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`ids` (array): A list of entry ids to delete

Array element:

(string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/add-substitute-ids

Add substitute parts to a project/BOM entry

Adds part ids to the entry's set of substitutes. Substitutes are alternative parts that may be used for this BOM line item in this specific project, independent of the part-level substitute list. Only part ids owned by the user and not sub-assembly parts are accepted; the entry's own primary part is excluded. The entry must already be matched to a part (`:entry/part-id` set).

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`entry/id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form

`entry/substitute-ids` (array): A set of part ids that may be used as substitutes for the entry's primary part for this specific BOM

Array element:

(string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/remove-substitute-ids

Remove substitute parts from a project/BOM entry

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`entry/id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form

`entry/substitute-ids` (array): A set of part ids that may be used as substitutes for the entry's primary part for this specific BOM

Array element:

(string): Part id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/get-builds

Get all builds for a project/BOM

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of builds
    
    Array element:
    
    (map): Complete build data structure
    
    Map contents:
    
    *   `build/id` (string): Build id / UUID in 26-character compact form
        
    *   `build/project-id` (string): ID of the project this build belongs to / UUID in 26-character compact form
        
    *   `build/timestamp` (64-bit UNIX timestamp in UTC time zone): Timestamp when the build was created
        
    *   `build/quantity` (integer): Number of units built
        
    *   `build/comments` (string): Comments for this build
        
    *   `build/tags` (array): A list of tags for this build
        
        Array element:
        
        (string): Tag
        
    *   `build/custom-fields` (array): Custom fields for this build / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `build/attachments` (array): List of attachments for this build
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/builds

Get all builds for a project

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of builds for this project
    
    Array element:
    
    (map): Complete build data structure
    
    Map contents:
    
    *   `build/id` (string): Build id / UUID in 26-character compact form
        
    *   `build/project-id` (string): ID of the project this build belongs to / UUID in 26-character compact form
        
    *   `build/timestamp` (64-bit UNIX timestamp in UTC time zone): Timestamp when the build was created
        
    *   `build/quantity` (integer): Number of units built
        
    *   `build/comments` (string): Comments for this build
        
    *   `build/tags` (array): A list of tags for this build
        
        Array element:
        
        (string): Tag
        
    *   `build/custom-fields` (array): Custom fields for this build / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `build/attachments` (array): List of attachments for this build
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/archive

Archive a project

Archiving a project causes it not to show up in normal usage. It still exists in the database and can be accessed directly by id. It is also possible to un-archive (restore) the project. This is useful for projects that are no longer actively used, but should be kept in the database to maintain history and traceability.

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### project/restore

Restore an archived storage location

This project will be restored (un-archived) and will behave like a normal project again.

###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### build/create

Create and execute a single-stage build for a project

Creates and executes a single-stage build. The server computes stock sourcing the same way the application does when no sources are manually selected: stock is consumed from available sources in FIFO order (oldest stock first), with part attrition applied according to each part's settings. The build is atomic: if there is not enough stock for any BOM entry, an error is returned, no build is created, and no stock is changed. The error response lists the affected entries under the `missing-stock` key. Note that this is stricter than the application, which warns about insufficient stock but allows the user to proceed.

Per-entry source selection, multi-stage builds, and attrition overrides are not available through this endpoint. Use the application to configure builds that need them.

If the project has an associated sub-assembly part, pass `add-stock` to add the resulting stock to a storage location, optionally with a price and (with lot control) information for the newly created lot. If you add a price, then currency becomes mandatory as well. Without `add-stock`, the build only consumes component stock.

Example:

```
curl -X POST \
  -H 'Content-Type: application/json' \
  -H 'Authorization: APIKey partsboxapi_...' \
  -d '{"project/id": "1pbvre0cfg4f58azmvsgetasxq", "build/quantity": 10, "build/comments": "Production run"}' \
  https://api.partsbox.com/api/1/build/create
```


###### Parameters

`project/id` (string): Project id / UUID in 26-character compact form

`build/quantity` (integer): Number of units built

`[optional] build/comments` (string): Comments for this build

`[optional] build/stock-comments` (string): Comments applied to the component stock entries created by this build

`[optional] build/tags` (array): A list of tags for this build

Array element:

(string): Tag

`[optional] add-stock` (map): Output stock to add for the project's sub-assembly part. Only used when the project has a sub-assembly part and the sub-assembly-parts feature is present.

Map contents:

*   `storage-id` (string): Storage location for the resulting sub-assembly part stock / Storage location id / UUID in 26-character compact form
    
*   `[optional] comments` (string): Comments for the resulting stock entry
    
*   `[optional] price` (number): Unit price for the resulting stock
    
*   `[optional] currency` (enum):
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `[optional] lot` (map): Information about the newly created lot
    
    Map contents:
    
    *   `lot/created` (64-bit UNIX timestamp in UTC time zone): The date when this lot was created.
        
    *   `lot/name` (string): Lot name or number as defined within the company. A lot represents a specific batch of parts and can have data associated with it. Assigning a lot name is not mandatory: PartsBox automatically generates unique IDs for every lot.
        
    *   `lot/description` (string): A short optional description of the lot.
        
    *   `lot/comments` (string): Any other comments that will be stored with this lot.
        
    *   `lot/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `lot/expiration-date` (64-bit UNIX timestamp in UTC time zone): Date when this lot expires
        
    

###### Return value

(map):

Map contents:

*   `data` (map): Contains the id of the newly created build
    
    Map contents:
    
    *   `build/id` (string): Build id / UUID in 26-character compact form
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### build/get

Get a single project build identified by \`build/id\`

Returns build data including any attachments and custom fields associated with the build.

###### Parameters

`build/id` (string): Build id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Data for a single build, including attachments and custom fields if present / Complete build data structure
    
    Map contents:
    
    *   `build/id` (string): Build id / UUID in 26-character compact form
        
    *   `build/project-id` (string): ID of the project this build belongs to / UUID in 26-character compact form
        
    *   `build/timestamp` (64-bit UNIX timestamp in UTC time zone): Timestamp when the build was created
        
    *   `build/quantity` (integer): Number of units built
        
    *   `build/comments` (string): Comments for this build
        
    *   `build/tags` (array): A list of tags for this build
        
        Array element:
        
        (string): Tag
        
    *   `build/custom-fields` (array): Custom fields for this build / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `build/attachments` (array): List of attachments for this build
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### build/update

Update (modify) a project build

Updates build properties including comments, tags, and custom fields. Custom fields can also be updated using the generic `custom-field/update` endpoint with table set to "builds".

###### Parameters

`build/id` (string): Build id / UUID in 26-character compact form

`[optional] build/comments` (string): Comments for this build

`[optional] build/tags` (array): A list of tags for this build

Array element:

(string): Tag

`[optional] build/custom-fields` (array): Custom fields for this build / A list of custom fields to create or update

Array element:

(map): Custom field, consisting of a key and value

Map contents:

*   `key` (string): Custom field key, limited to 256 characters
    
*   `value` (string): Custom field value, limited to 1024 characters
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### build/all

Get all project builds

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data` (array): A list with data for all builds
    
    Array element:
    
    (map): Complete build data structure
    
    Map contents:
    
    *   `build/id` (string): Build id / UUID in 26-character compact form
        
    *   `build/project-id` (string): ID of the project this build belongs to / UUID in 26-character compact form
        
    *   `build/timestamp` (64-bit UNIX timestamp in UTC time zone): Timestamp when the build was created
        
    *   `build/quantity` (integer): Number of units built
        
    *   `build/comments` (string): Comments for this build
        
    *   `build/tags` (array): A list of tags for this build
        
        Array element:
        
        (string): Tag
        
    *   `build/custom-fields` (array): Custom fields for this build / A list of custom fields to create or update
        
        Array element:
        
        (map): Custom field, consisting of a key and value
        
        Map contents:
        
        *   `key` (string): Custom field key, limited to 256 characters
            
        *   `value` (string): Custom field value, limited to 1024 characters
            
        
    *   `build/attachments` (array): List of attachments for this build
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Orders
------

### order/get

Get single order data

This will return data for a single order identified by an order id.

###### Parameters

`order/id` (string): Order id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Data for a single order / Data representing a purchase order
    
    Map contents:
    
    *   `order/id` (string): Order id / UUID in 26-character compact form
        
    *   `order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
        
    *   `order/vendor-name` (string): The name of the vendor/distributor
        
    *   `order/number` (string): Vendor/distributor order number (as assigned by the vendor)
        
    *   `order/invoice-number` (string): Vendor/distributor invoice number
        
    *   `order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
        
    *   `order/comments` (string): Your comments for this order
        
    *   `order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
        
    *   `order/status` (enum): Order status, read-only (cannot be set directly)
        
        Possible values:
        
        "ordered", "received", "open"
        
    *   `order/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `order/entries` (array): The order's line items (one per vendor SKU), tracking quantities in vendor units.
        
        Array element:
        
        (map): An order line item, tracking quantities in vendor units (e.g. spools, header strips). Linked 1:1 to a stock entry on the part via \`order-entry/stock-id\` until fully received.
        
        Map contents:
        
        *   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
            
        *   `order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
            
        *   `[optional] order-entry/stock-id` (string): Stock entry id corresponding to this order entry / UUID in 26-character compact form
            
        *   `order-entry/vendor-sku` (string): Vendor SKU for this order line.
            
        *   `order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
            
        *   `order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
            
        *   `[optional] order-entry/price` (number): Per-vendor-unit price.
            
        *   `[optional] order-entry/currency` (enum): Currency for the price.
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
            
        
    *   `order/custom-fields`:
        
    *   `order/attachments` (array): List of attachments for this order
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/all

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data` (array): Data for all orders
    
    Array element:
    
    (map): Data representing a purchase order
    
    Map contents:
    
    *   `order/id` (string): Order id / UUID in 26-character compact form
        
    *   `order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
        
    *   `order/vendor-name` (string): The name of the vendor/distributor
        
    *   `order/number` (string): Vendor/distributor order number (as assigned by the vendor)
        
    *   `order/invoice-number` (string): Vendor/distributor invoice number
        
    *   `order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
        
    *   `order/comments` (string): Your comments for this order
        
    *   `order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
        
    *   `order/status` (enum): Order status, read-only (cannot be set directly)
        
        Possible values:
        
        "ordered", "received", "open"
        
    *   `order/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `order/entries` (array): The order's line items (one per vendor SKU), tracking quantities in vendor units.
        
        Array element:
        
        (map): An order line item, tracking quantities in vendor units (e.g. spools, header strips). Linked 1:1 to a stock entry on the part via \`order-entry/stock-id\` until fully received.
        
        Map contents:
        
        *   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
            
        *   `order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
            
        *   `[optional] order-entry/stock-id` (string): Stock entry id corresponding to this order entry / UUID in 26-character compact form
            
        *   `order-entry/vendor-sku` (string): Vendor SKU for this order line.
            
        *   `order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
            
        *   `order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
            
        *   `[optional] order-entry/price` (number): Per-vendor-unit price.
            
        *   `[optional] order-entry/currency` (enum): Currency for the price.
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
            
        
    *   `order/custom-fields`:
        
    *   `order/attachments` (array): List of attachments for this order
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/get-entries

Get stock entries in an order

Returns the stock entries for the parts in this order.

###### Parameters

`order/id` (string): Order id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of stock entries
    
    Array element:
    
    (map): A stock entry, which might represent stock that is on hand, order entries, or planned stock that will become available in the future.
    
    Map contents:
    
    *   `stock/id` (string): Stock entry id / UUID in 26-character compact form
        
    *   `stock/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `stock/storage-id` (string): Storage location id / UUID in 26-character compact form
        
    *   `stock/lot-id` (string): Lot id / UUID in 26-character compact form
        
    *   `stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
        
    *   `stock/price` (number): Price per part unit (the unit chosen for the part via \`:part/unit\`); for parts without a unit, price per piece. This is the regime both when supplying a price (e.g. \`stock/add\`) and when reading one back, including the stock entries that orders return.
        
    *   `stock/currency` (enum):
        
        Possible values:
        
        "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
        
    *   `stock/timestamp` (64-bit UNIX timestamp in UTC time zone): Timestamp when stock entry was created
        
    *   `stock/status` (enum): Stock status, no status means on-hand stock.
        
        Possible values:
        
        "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
        
    *   `stock/comments` (string): Comments for this stock entry
        
    *   `stock/order-id` (string): Order that this stock entry belongs to / Order id / UUID in 26-character compact form
        
    *   `stock/vendor-sku` (string): For stock ordered from a distributor, the vendor SKU that was ordered
        
    *   `stock/custom-price?` (boolean): Has a custom price been entered for this entry? If true, pricing will not be automatically updated.
        
    *   `stock/arriving` (64-bit UNIX timestamp in UTC time zone): Date when this stock entry is expected to arrive, used for stock entries in orders.
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/receive

Receive order entries into inventory

Receives order entries into the specified storage location. Only orders with the status 'ordered' can be received. If optional `order-entries` is provided, receives only the specified order entries, otherwise receives all order entries that haven't been received yet. Each entry in `order-entries` identifies the order entry by its permanent `order-entry/id` and optionally specifies how many vendor units to receive. With lot control, information for the newly created lot can be provided optionally using the optional `lot` parameter. `lot/name` will only be used if a single lot is being created (e.g. a single order entry is being received). Once all order entries have been received, the status of the order will be automatically switched from 'ordered' to 'received'. The deprecated `stock-entries` parameter is still accepted for backward compatibility.

###### Parameters

`order/id` (string): Order id / UUID in 26-character compact form

`storage/id` (string): Storage location id / UUID in 26-character compact form

`[optional] order-entries` (array): Order entries to receive. If omitted, all unreceived order entries are received.

Array element:

(map): An order entry specifying stock being received from an order. \`order-entry/id\` is the permanent entry identifier. Optionally specify \`order-entry/received-quantity\` as the number of vendor units to receive (defaults to all remaining).

Map contents:

*   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
    
*   `[optional] order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
    

`[optional] stock-entries` (array): DEPRECATED: use \`order-entries\` instead

Array element:

(map): DEPRECATED: use \`order-entries\` instead. A stock entry specifying stock being received from an order. \`stock/quantity\` is given in part units and must be a whole multiple of the part's package quantity.

Map contents:

*   `stock/id` (string): Stock entry id / UUID in 26-character compact form
    
*   `[optional] stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    

`[optional] stock/comments` (string): Comments for this stock entry

`[optional] lot` (map): Information about the newly created lot

Map contents:

*   `lot/created` (64-bit UNIX timestamp in UTC time zone): The date when this lot was created.
    
*   `lot/name` (string): Lot name or number as defined within the company. A lot represents a specific batch of parts and can have data associated with it. Assigning a lot name is not mandatory: PartsBox automatically generates unique IDs for every lot.
    
*   `lot/description` (string): A short optional description of the lot.
    
*   `lot/comments` (string): Any other comments that will be stored with this lot.
    
*   `lot/tags` (array): A list of tags
    
    Array element:
    
    (string): Tag
    
*   `lot/expiration-date` (64-bit UNIX timestamp in UTC time zone): Date when this lot expires
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/create

Create an order and add entries or add entries to an existing order

Creates a new order with the supplied entries, or adds entries to an existing order if `order/id` is supplied. When `order/id` is supplied, the `order` parameter is ignored. Adding to existing orders will only work for orders with 'open' status. Each entry should use the recommended `order-entry/*` fields; the legacy `stock/*` entry shape is deprecated but still accepted for backwards-compatibility.

###### Parameters

`[optional] order/id` (string): Order id / UUID in 26-character compact form

`[optional] entries` (array):

Array element:

(map): An entry being added to an order. Quantity is the integer vendor-unit count (e.g. number of spools, header strips) and price is per vendor unit. RECOMMENDED: use the \`order-entry/\*\` fields (\`order-entry/part-id\`, \`order-entry/vendor-quantity\`, \`order-entry/vendor-sku\`, and optionally \`order-entry/price\`, \`order-entry/currency\`, \`order-entry/arriving\`). DEPRECATED: the \`stock/\*\` fields (\`stock/part-id\`, \`stock/quantity\`, \`stock/vendor-sku\`, \`stock/price\`, \`stock/currency\`, \`stock/arriving\`) are still accepted for backwards-compatibility; use the \`order-entry/\*\` fields instead.

Map contents:

*   `[optional] order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
    
*   `[optional] order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
    
*   `[optional] order-entry/vendor-sku` (string): Vendor SKU for this order line.
    
*   `[optional] order-entry/price` (number): Per-vendor-unit price.
    
*   `[optional] order-entry/currency` (enum): Currency for the price.
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
    
*   `[optional] stock/part-id` (string): Part id / UUID in 26-character compact form
    
*   `[optional] stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    
*   `[optional] stock/vendor-sku` (string): For stock ordered from a distributor, the vendor SKU that was ordered
    
*   `[optional] stock/price` (number): Price per part unit (the unit chosen for the part via \`:part/unit\`); for parts without a unit, price per piece. This is the regime both when supplying a price (e.g. \`stock/add\`) and when reading one back, including the stock entries that orders return.
    
*   `[optional] stock/currency` (enum):
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `[optional] stock/arriving` (64-bit UNIX timestamp in UTC time zone): Date when this stock entry is expected to arrive, used for stock entries in orders.
    

`[optional] order` (map): New purchase order data

Map contents:

*   `[optional] order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
    
*   `[optional] order/vendor-name` (string): The name of the vendor/distributor
    
*   `[optional] order/number` (string): Vendor/distributor order number (as assigned by the vendor)
    
*   `[optional] order/invoice-number` (string): Vendor/distributor invoice number
    
*   `[optional] order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
    
*   `[optional] order/comments` (string): Your comments for this order
    
*   `[optional] order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
    
*   `[optional] order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
    
*   `[optional] order/tags` (array): A list of tags
    
    Array element:
    
    (string): Tag
    
*   `[optional] order/custom-fields`:
    

###### Return value

(map):

Map contents:

*   `data` (map): Newly created or updated order / Data representing a purchase order
    
    Map contents:
    
    *   `order/id` (string): Order id / UUID in 26-character compact form
        
    *   `order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
        
    *   `order/vendor-name` (string): The name of the vendor/distributor
        
    *   `order/number` (string): Vendor/distributor order number (as assigned by the vendor)
        
    *   `order/invoice-number` (string): Vendor/distributor invoice number
        
    *   `order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
        
    *   `order/comments` (string): Your comments for this order
        
    *   `order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
        
    *   `order/status` (enum): Order status, read-only (cannot be set directly)
        
        Possible values:
        
        "ordered", "received", "open"
        
    *   `order/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `order/entries` (array): The order's line items (one per vendor SKU), tracking quantities in vendor units.
        
        Array element:
        
        (map): An order line item, tracking quantities in vendor units (e.g. spools, header strips). Linked 1:1 to a stock entry on the part via \`order-entry/stock-id\` until fully received.
        
        Map contents:
        
        *   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
            
        *   `order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
            
        *   `[optional] order-entry/stock-id` (string): Stock entry id corresponding to this order entry / UUID in 26-character compact form
            
        *   `order-entry/vendor-sku` (string): Vendor SKU for this order line.
            
        *   `order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
            
        *   `order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
            
        *   `[optional] order-entry/price` (number): Per-vendor-unit price.
            
        *   `[optional] order-entry/currency` (enum): Currency for the price.
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
            
        
    *   `order/custom-fields`:
        
    *   `order/attachments` (array): List of attachments for this order
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/add-entries

Add entries to an existing order

Adds supplied entries to an existing order, which must have 'open' status. Each entry should use the recommended `order-entry/*` fields; the legacy `stock/*` entry shape is deprecated but still accepted for backwards-compatibility.

###### Parameters

`order/id` (string): Order id / UUID in 26-character compact form

`entries` (array):

Array element:

(map): An entry being added to an order. Quantity is the integer vendor-unit count (e.g. number of spools, header strips) and price is per vendor unit. RECOMMENDED: use the \`order-entry/\*\` fields (\`order-entry/part-id\`, \`order-entry/vendor-quantity\`, \`order-entry/vendor-sku\`, and optionally \`order-entry/price\`, \`order-entry/currency\`, \`order-entry/arriving\`). DEPRECATED: the \`stock/\*\` fields (\`stock/part-id\`, \`stock/quantity\`, \`stock/vendor-sku\`, \`stock/price\`, \`stock/currency\`, \`stock/arriving\`) are still accepted for backwards-compatibility; use the \`order-entry/\*\` fields instead.

Map contents:

*   `[optional] order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
    
*   `[optional] order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
    
*   `[optional] order-entry/vendor-sku` (string): Vendor SKU for this order line.
    
*   `[optional] order-entry/price` (number): Per-vendor-unit price.
    
*   `[optional] order-entry/currency` (enum): Currency for the price.
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
    
*   `[optional] stock/part-id` (string): Part id / UUID in 26-character compact form
    
*   `[optional] stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
    
*   `[optional] stock/vendor-sku` (string): For stock ordered from a distributor, the vendor SKU that was ordered
    
*   `[optional] stock/price` (number): Price per part unit (the unit chosen for the part via \`:part/unit\`); for parts without a unit, price per piece. This is the regime both when supplying a price (e.g. \`stock/add\`) and when reading one back, including the stock entries that orders return.
    
*   `[optional] stock/currency` (enum):
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `[optional] stock/arriving` (64-bit UNIX timestamp in UTC time zone): Date when this stock entry is expected to arrive, used for stock entries in orders.
    

###### Return value

(map):

Map contents:

*   `data` (array): Newly added entries
    
    Array element:
    
    (map): A stock entry, which might represent stock that is on hand, order entries, or planned stock that will become available in the future.
    
    Map contents:
    
    *   `stock/id` (string): Stock entry id / UUID in 26-character compact form
        
    *   `stock/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `stock/storage-id` (string): Storage location id / UUID in 26-character compact form
        
    *   `stock/lot-id` (string): Lot id / UUID in 26-character compact form
        
    *   `stock/quantity` (number): Stock quantity, in the part's unit of measure (the unit chosen via \`:part/unit\`). A whole number for parts without a unit; fractional values are allowed for unit-based parts.
        
    *   `stock/price` (number): Price per part unit (the unit chosen for the part via \`:part/unit\`); for parts without a unit, price per piece. This is the regime both when supplying a price (e.g. \`stock/add\`) and when reading one back, including the stock entries that orders return.
        
    *   `stock/currency` (enum):
        
        Possible values:
        
        "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
        
    *   `stock/timestamp` (64-bit UNIX timestamp in UTC time zone): Timestamp when stock entry was created
        
    *   `stock/status` (enum): Stock status, no status means on-hand stock.
        
        Possible values:
        
        "ordered", "allocated", "in-production", "held", "in-transit", "planned", "rejected", "being-ordered"
        
    *   `stock/comments` (string): Comments for this stock entry
        
    *   `stock/order-id` (string): Order that this stock entry belongs to / Order id / UUID in 26-character compact form
        
    *   `stock/vendor-sku` (string): For stock ordered from a distributor, the vendor SKU that was ordered
        
    *   `stock/custom-price?` (boolean): Has a custom price been entered for this entry? If true, pricing will not be automatically updated.
        
    *   `stock/arriving` (64-bit UNIX timestamp in UTC time zone): Date when this stock entry is expected to arrive, used for stock entries in orders.
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/delete-entry

Delete an entry from an existing order

Deletes an entry from an existing order, which must have 'open' or 'ordered' status. Identify the entry with `order-entry/id` plus `order/id`. The legacy `stock/order-id` + `stock/id` + `stock/part-id` triple is also accepted for backwards-compatibility.

###### Parameters

`stock/deleted-order-entry` (map): An order entry being deleted from an order. Supply EITHER (preferred) \`order/id\` + \`order-entry/id\`, OR (legacy, accepted for backwards-compatibility) the stock-entry triple \`stock/order-id\` + \`stock/id\` + \`stock/part-id\`.

Map contents:

*   `[optional] order/id` (string): Order id / UUID in 26-character compact form
    
*   `[optional] order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
    
*   `[optional] stock/order-id` (string): Order that this stock entry belongs to / Order id / UUID in 26-character compact form
    
*   `[optional] stock/id` (string): Stock entry id / UUID in 26-character compact form
    
*   `[optional] stock/part-id` (string): Part id / UUID in 26-character compact form
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/update-entry

Update fields on an existing order entry

Updates editable fields on an existing order entry. The order must have 'open' or 'ordered' status. Supplying `order-entry/vendor-quantity` smaller than or equal to the already-received quantity is rejected. Optional fields not supplied are left unchanged.

###### Parameters

`order-entry/updated-order-entry` (map): Fields to change on an order entry. Only the supplied fields are updated; \`order-entry/id\` and \`order/id\` identify the target.

Map contents:

*   `order/id` (string): Order id / UUID in 26-character compact form
    
*   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
    
*   `[optional] order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
    
*   `[optional] order-entry/vendor-sku` (string): Vendor SKU for this order line.
    
*   `[optional] order-entry/price` (number): Per-vendor-unit price.
    
*   `[optional] order-entry/currency` (enum): Currency for the price.
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
    

###### Return value

(map):

Map contents:

*   `data` (map): Updated order entry / An order line item, tracking quantities in vendor units (e.g. spools, header strips). Linked 1:1 to a stock entry on the part via \`order-entry/stock-id\` until fully received.
    
    Map contents:
    
    *   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
        
    *   `order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
        
    *   `[optional] order-entry/stock-id` (string): Stock entry id corresponding to this order entry / UUID in 26-character compact form
        
    *   `order-entry/vendor-sku` (string): Vendor SKU for this order line.
        
    *   `order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
        
    *   `order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
        
    *   `[optional] order-entry/price` (number): Per-vendor-unit price.
        
    *   `[optional] order-entry/currency` (enum): Currency for the price.
        
        Possible values:
        
        "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
        
    *   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/update

Update order data

Updates header fields of an existing order. Only the supplied fields are updated; fields that are not supplied remain unchanged. Supplying an empty string for a field removes that field from the order. The order status cannot be changed with this operation — use `order/mark-ordered` to place an order and `order/receive` to receive it.

###### Parameters

`order/id` (string): Order id / UUID in 26-character compact form

`[optional] order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created

`[optional] order/vendor-name` (string): The name of the vendor/distributor

`[optional] order/number` (string): Vendor/distributor order number (as assigned by the vendor)

`[optional] order/invoice-number` (string): Vendor/distributor invoice number

`[optional] order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.

`[optional] order/comments` (string): Your comments for this order

`[optional] order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.

`[optional] order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.

`[optional] order/tags` (array): A list of tags

Array element:

(string): Tag

`[optional] order/custom-fields`:

###### Return value

(map):

Map contents:

*   `data` (map): Updated order / Data representing a purchase order
    
    Map contents:
    
    *   `order/id` (string): Order id / UUID in 26-character compact form
        
    *   `order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
        
    *   `order/vendor-name` (string): The name of the vendor/distributor
        
    *   `order/number` (string): Vendor/distributor order number (as assigned by the vendor)
        
    *   `order/invoice-number` (string): Vendor/distributor invoice number
        
    *   `order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
        
    *   `order/comments` (string): Your comments for this order
        
    *   `order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
        
    *   `order/status` (enum): Order status, read-only (cannot be set directly)
        
        Possible values:
        
        "ordered", "received", "open"
        
    *   `order/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `order/entries` (array): The order's line items (one per vendor SKU), tracking quantities in vendor units.
        
        Array element:
        
        (map): An order line item, tracking quantities in vendor units (e.g. spools, header strips). Linked 1:1 to a stock entry on the part via \`order-entry/stock-id\` until fully received.
        
        Map contents:
        
        *   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
            
        *   `order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
            
        *   `[optional] order-entry/stock-id` (string): Stock entry id corresponding to this order entry / UUID in 26-character compact form
            
        *   `order-entry/vendor-sku` (string): Vendor SKU for this order line.
            
        *   `order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
            
        *   `order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
            
        *   `[optional] order-entry/price` (number): Per-vendor-unit price.
            
        *   `[optional] order-entry/currency` (enum): Currency for the price.
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
            
        
    *   `order/custom-fields`:
        
    *   `order/attachments` (array): List of attachments for this order
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/mark-ordered

Mark an order as ordered (placed with the vendor)

Transitions an order from 'open' to 'ordered' status, the equivalent of the 'Mark as ordered' action in the user interface. The optional `order/arriving` parameter sets the expected arrival date. If it is not supplied and the order does not have an arrival date yet, the current time is used. The arrival date is propagated to the order's stock entries. Once an order is marked as ordered, it can be received using `order/receive`.

###### Parameters

`order/id` (string): Order id / UUID in 26-character compact form

`[optional] order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.

###### Return value

(map):

Map contents:

*   `data` (map): Updated order / Data representing a purchase order
    
    Map contents:
    
    *   `order/id` (string): Order id / UUID in 26-character compact form
        
    *   `order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
        
    *   `order/vendor-name` (string): The name of the vendor/distributor
        
    *   `order/number` (string): Vendor/distributor order number (as assigned by the vendor)
        
    *   `order/invoice-number` (string): Vendor/distributor invoice number
        
    *   `order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
        
    *   `order/comments` (string): Your comments for this order
        
    *   `order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
        
    *   `order/status` (enum): Order status, read-only (cannot be set directly)
        
        Possible values:
        
        "ordered", "received", "open"
        
    *   `order/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `order/entries` (array): The order's line items (one per vendor SKU), tracking quantities in vendor units.
        
        Array element:
        
        (map): An order line item, tracking quantities in vendor units (e.g. spools, header strips). Linked 1:1 to a stock entry on the part via \`order-entry/stock-id\` until fully received.
        
        Map contents:
        
        *   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
            
        *   `order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
            
        *   `[optional] order-entry/stock-id` (string): Stock entry id corresponding to this order entry / UUID in 26-character compact form
            
        *   `order-entry/vendor-sku` (string): Vendor SKU for this order line.
            
        *   `order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
            
        *   `order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
            
        *   `[optional] order-entry/price` (number): Per-vendor-unit price.
            
        *   `[optional] order-entry/currency` (enum): Currency for the price.
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
            
        
    *   `order/custom-fields`:
        
    *   `order/attachments` (array): List of attachments for this order
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### order/cancel

Cancel an order, switching it back to 'open' status

Transitions an order from 'ordered' back to 'open' status, the equivalent of the 'Cancel order' action in the user interface. The order's stock entries that have not been received yet return to the 'being-ordered' status. Stock entries that have already been received are not affected.

###### Parameters

`order/id` (string): Order id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Updated order / Data representing a purchase order
    
    Map contents:
    
    *   `order/id` (string): Order id / UUID in 26-character compact form
        
    *   `order/created` (64-bit UNIX timestamp in UTC time zone): The date when this order was created
        
    *   `order/vendor-name` (string): The name of the vendor/distributor
        
    *   `order/number` (string): Vendor/distributor order number (as assigned by the vendor)
        
    *   `order/invoice-number` (string): Vendor/distributor invoice number
        
    *   `order/po-number` (string): Your purchase order number. Leave blank to use the auto-generated ID.
        
    *   `order/comments` (string): Your comments for this order
        
    *   `order/notes` (string): Any additional notes stored with the order. Markdown syntax is supported and links will be automatically highlighted.
        
    *   `order/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date for the entire order. Indicative only: order entries have their own expected delivery dates.
        
    *   `order/status` (enum): Order status, read-only (cannot be set directly)
        
        Possible values:
        
        "ordered", "received", "open"
        
    *   `order/tags` (array): A list of tags
        
        Array element:
        
        (string): Tag
        
    *   `order/entries` (array): The order's line items (one per vendor SKU), tracking quantities in vendor units.
        
        Array element:
        
        (map): An order line item, tracking quantities in vendor units (e.g. spools, header strips). Linked 1:1 to a stock entry on the part via \`order-entry/stock-id\` until fully received.
        
        Map contents:
        
        *   `order-entry/id` (string): Permanent unique identifier for the order entry / UUID in 26-character compact form
            
        *   `order-entry/part-id` (string): Part this order entry refers to. / UUID in 26-character compact form
            
        *   `[optional] order-entry/stock-id` (string): Stock entry id corresponding to this order entry / UUID in 26-character compact form
            
        *   `order-entry/vendor-sku` (string): Vendor SKU for this order line.
            
        *   `order-entry/vendor-quantity` (integer): Quantity in vendor units (e.g. spools, header strips), as ordered.
            
        *   `order-entry/received-quantity` (integer): When supplied in an \`order/receive\` request, the number of vendor units to receive in this operation (defaults to all remaining). When returned in an order entry, the cumulative number of vendor units received so far.
            
        *   `[optional] order-entry/price` (number): Per-vendor-unit price.
            
        *   `[optional] order-entry/currency` (enum): Currency for the price.
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `[optional] order-entry/arriving` (64-bit UNIX timestamp in UTC time zone): Expected delivery date.
            
        
    *   `order/custom-fields`:
        
    *   `order/attachments` (array): List of attachments for this order
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Offers
------

The API offers endpoints for managing local offers, which represent prices and conditions from suppliers that are manually entered. Only local offers can be manipulated through the API.

### offer/all

Get all local offers

Returns all local offers in the database.

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data` (array): List of all local offers in the database
    
    Array element:
    
    (map): Complete offer data structure
    
    Map contents:
    
    *   `offer/id` (string): Offer id / UUID in 26-character compact form
        
    *   `offer/type` (enum): Offer type. Only 'local' is allowed when creating or modifying offers through the API.
        
        Possible values:
        
        "local", "online", "service"
        
    *   `offer/timestamp`:
        
    *   `offer/date`:
        
    *   `offer/vendor-name` (string): Name of the vendor/supplier
        
    *   `offer/sku` (string): Vendor's stock keeping unit (SKU) or part number
        
    *   `offer/moq` (integer): Minimum order quantity
        
    *   `offer/order-multiple` (integer): Order multiple (must order in multiples of this number)
        
    *   `offer/prices` (array): All pricing structures for an offer
        
        Array element:
        
        (map): Price structure with currency and discounts
        
        Map contents:
        
        *   `currency` (enum): Currency for this price structure / Currency code for prices
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `discounts` (array): Price breaks / Collection of price breaks, sorted by quantity
            
            Array element:
            
            (map): A single price break in a pricing structure
            
            Map contents:
            
            *   `quantity` (integer): Quantity at which this price break applies
                
            *   `amount` (number): Price per unit at this quantity
                
            
        
    *   `offer/in-stock` (enum): Stocking status at the supplier
        
        Possible values:
        
        "yes", "no", "maybe", "assumed"
        
    *   `offer/reference` (string): Reference information for this offer
        
    *   `offer/comments` (string): Comments for this offer
        
    *   `offer/url` (string): URL for this offer at the supplier's website
        
    *   `offer/expires` (64-bit UNIX timestamp in UTC time zone): Expiration date for the offer. Passing null/nil removes the expiry date
        
    *   `offer/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `offer/entry-id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
        
    *   `offer/attachments` (array): List of attachments for this offer
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### offer/get

Get an offer, get all offers for a specific part, or get all offers for a list entry id

Returns all offers for a given part id or list entry id. Exactly one of the parameters is required.

###### Parameters

`offer/id` (string): Offer id / UUID in 26-character compact form

`offer/part-id` (string): Part id / UUID in 26-character compact form

`offer/entry-id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): List of offers (containing a single offer in case a specific offer id was requested)
    
    Array element:
    
    (map): Complete offer data structure
    
    Map contents:
    
    *   `offer/id` (string): Offer id / UUID in 26-character compact form
        
    *   `offer/type` (enum): Offer type. Only 'local' is allowed when creating or modifying offers through the API.
        
        Possible values:
        
        "local", "online", "service"
        
    *   `offer/timestamp`:
        
    *   `offer/date`:
        
    *   `offer/vendor-name` (string): Name of the vendor/supplier
        
    *   `offer/sku` (string): Vendor's stock keeping unit (SKU) or part number
        
    *   `offer/moq` (integer): Minimum order quantity
        
    *   `offer/order-multiple` (integer): Order multiple (must order in multiples of this number)
        
    *   `offer/prices` (array): All pricing structures for an offer
        
        Array element:
        
        (map): Price structure with currency and discounts
        
        Map contents:
        
        *   `currency` (enum): Currency for this price structure / Currency code for prices
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `discounts` (array): Price breaks / Collection of price breaks, sorted by quantity
            
            Array element:
            
            (map): A single price break in a pricing structure
            
            Map contents:
            
            *   `quantity` (integer): Quantity at which this price break applies
                
            *   `amount` (number): Price per unit at this quantity
                
            
        
    *   `offer/in-stock` (enum): Stocking status at the supplier
        
        Possible values:
        
        "yes", "no", "maybe", "assumed"
        
    *   `offer/reference` (string): Reference information for this offer
        
    *   `offer/comments` (string): Comments for this offer
        
    *   `offer/url` (string): URL for this offer at the supplier's website
        
    *   `offer/expires` (64-bit UNIX timestamp in UTC time zone): Expiration date for the offer. Passing null/nil removes the expiry date
        
    *   `offer/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `offer/entry-id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
        
    *   `offer/attachments` (array): List of attachments for this offer
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### offer/add

Add a new local offer for a part or a purchase list entry

Creates a new local offer for a part. Only local offers can be added through the API. The offer must specify a part id or a list entry id.

###### Parameters

`offer/type` (enum): Offer type. Only 'local' is allowed when creating or modifying offers through the API.

Possible values:

"local", "online", "service"

`offer/vendor-name` (string): Name of the vendor/supplier

`offer/sku` (string): Vendor's stock keeping unit (SKU) or part number

`offer/moq` (integer): Minimum order quantity

`offer/order-multiple` (integer): Order multiple (must order in multiples of this number)

`offer/in-stock` (enum): Stocking status at the supplier

Possible values:

"yes", "no", "maybe", "assumed"

`offer/prices` (array): All pricing structures for an offer

Array element:

(map): Price structure with currency and discounts

Map contents:

*   `currency` (enum): Currency for this price structure / Currency code for prices
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `discounts` (array): Price breaks / Collection of price breaks, sorted by quantity
    
    Array element:
    
    (map): A single price break in a pricing structure
    
    Map contents:
    
    *   `quantity` (integer): Quantity at which this price break applies
        
    *   `amount` (number): Price per unit at this quantity
        
    

`[optional] offer/reference` (string): Reference information for this offer

`[optional] offer/comments` (string): Comments for this offer

`[optional] offer/url` (string): URL for this offer at the supplier's website

`[optional] offer/expires` (64-bit UNIX timestamp in UTC time zone): Expiration date for the offer. Passing null/nil removes the expiry date

`[optional] offer/part-id` (string): Part id / UUID in 26-character compact form

`[optional] offer/entry-id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): The newly created offer / Complete offer data structure
    
    Map contents:
    
    *   `offer/id` (string): Offer id / UUID in 26-character compact form
        
    *   `offer/type` (enum): Offer type. Only 'local' is allowed when creating or modifying offers through the API.
        
        Possible values:
        
        "local", "online", "service"
        
    *   `offer/timestamp`:
        
    *   `offer/date`:
        
    *   `offer/vendor-name` (string): Name of the vendor/supplier
        
    *   `offer/sku` (string): Vendor's stock keeping unit (SKU) or part number
        
    *   `offer/moq` (integer): Minimum order quantity
        
    *   `offer/order-multiple` (integer): Order multiple (must order in multiples of this number)
        
    *   `offer/prices` (array): All pricing structures for an offer
        
        Array element:
        
        (map): Price structure with currency and discounts
        
        Map contents:
        
        *   `currency` (enum): Currency for this price structure / Currency code for prices
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `discounts` (array): Price breaks / Collection of price breaks, sorted by quantity
            
            Array element:
            
            (map): A single price break in a pricing structure
            
            Map contents:
            
            *   `quantity` (integer): Quantity at which this price break applies
                
            *   `amount` (number): Price per unit at this quantity
                
            
        
    *   `offer/in-stock` (enum): Stocking status at the supplier
        
        Possible values:
        
        "yes", "no", "maybe", "assumed"
        
    *   `offer/reference` (string): Reference information for this offer
        
    *   `offer/comments` (string): Comments for this offer
        
    *   `offer/url` (string): URL for this offer at the supplier's website
        
    *   `offer/expires` (64-bit UNIX timestamp in UTC time zone): Expiration date for the offer. Passing null/nil removes the expiry date
        
    *   `offer/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `offer/entry-id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
        
    *   `offer/attachments` (array): List of attachments for this offer
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### offer/update

Update an existing local offer

Updates an existing local offer. Only local offers can be updated through the API. You must specify the offer/id of the offer to update.

###### Parameters

`offer/id` (string): Offer id / UUID in 26-character compact form

`offer/vendor-name` (string): Name of the vendor/supplier

`offer/sku` (string): Vendor's stock keeping unit (SKU) or part number

`offer/moq` (integer): Minimum order quantity

`offer/order-multiple` (integer): Order multiple (must order in multiples of this number)

`offer/in-stock` (enum): Stocking status at the supplier

Possible values:

"yes", "no", "maybe", "assumed"

`offer/prices` (array): All pricing structures for an offer

Array element:

(map): Price structure with currency and discounts

Map contents:

*   `currency` (enum): Currency for this price structure / Currency code for prices
    
    Possible values:
    
    "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
    
*   `discounts` (array): Price breaks / Collection of price breaks, sorted by quantity
    
    Array element:
    
    (map): A single price break in a pricing structure
    
    Map contents:
    
    *   `quantity` (integer): Quantity at which this price break applies
        
    *   `amount` (number): Price per unit at this quantity
        
    

`offer/reference` (string): Reference information for this offer

`offer/comments` (string): Comments for this offer

`offer/url` (string): URL for this offer at the supplier's website

`offer/expires` (64-bit UNIX timestamp in UTC time zone): Expiration date for the offer. Passing null/nil removes the expiry date

###### Return value

(map):

Map contents:

*   `data` (map): The updated offer / Complete offer data structure
    
    Map contents:
    
    *   `offer/id` (string): Offer id / UUID in 26-character compact form
        
    *   `offer/type` (enum): Offer type. Only 'local' is allowed when creating or modifying offers through the API.
        
        Possible values:
        
        "local", "online", "service"
        
    *   `offer/timestamp`:
        
    *   `offer/date`:
        
    *   `offer/vendor-name` (string): Name of the vendor/supplier
        
    *   `offer/sku` (string): Vendor's stock keeping unit (SKU) or part number
        
    *   `offer/moq` (integer): Minimum order quantity
        
    *   `offer/order-multiple` (integer): Order multiple (must order in multiples of this number)
        
    *   `offer/prices` (array): All pricing structures for an offer
        
        Array element:
        
        (map): Price structure with currency and discounts
        
        Map contents:
        
        *   `currency` (enum): Currency for this price structure / Currency code for prices
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `discounts` (array): Price breaks / Collection of price breaks, sorted by quantity
            
            Array element:
            
            (map): A single price break in a pricing structure
            
            Map contents:
            
            *   `quantity` (integer): Quantity at which this price break applies
                
            *   `amount` (number): Price per unit at this quantity
                
            
        
    *   `offer/in-stock` (enum): Stocking status at the supplier
        
        Possible values:
        
        "yes", "no", "maybe", "assumed"
        
    *   `offer/reference` (string): Reference information for this offer
        
    *   `offer/comments` (string): Comments for this offer
        
    *   `offer/url` (string): URL for this offer at the supplier's website
        
    *   `offer/expires` (64-bit UNIX timestamp in UTC time zone): Expiration date for the offer. Passing null/nil removes the expiry date
        
    *   `offer/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `offer/entry-id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
        
    *   `offer/attachments` (array): List of attachments for this offer
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### offer/delete

Delete an existing local offer

Deletes an existing local offer. Only local offers can be deleted through the API.

###### Parameters

`offer/id` (string): Offer id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Contains the id of the deleted offer / Complete offer data structure
    
    Map contents:
    
    *   `offer/id` (string): Offer id / UUID in 26-character compact form
        
    *   `offer/type` (enum): Offer type. Only 'local' is allowed when creating or modifying offers through the API.
        
        Possible values:
        
        "local", "online", "service"
        
    *   `offer/timestamp`:
        
    *   `offer/date`:
        
    *   `offer/vendor-name` (string): Name of the vendor/supplier
        
    *   `offer/sku` (string): Vendor's stock keeping unit (SKU) or part number
        
    *   `offer/moq` (integer): Minimum order quantity
        
    *   `offer/order-multiple` (integer): Order multiple (must order in multiples of this number)
        
    *   `offer/prices` (array): All pricing structures for an offer
        
        Array element:
        
        (map): Price structure with currency and discounts
        
        Map contents:
        
        *   `currency` (enum): Currency for this price structure / Currency code for prices
            
            Possible values:
            
            "bgn", "pln", "aud", "krw", "chf", "cad", "sek", "rub", "zar", "usd", "nok", "brl", "uah", "aed", "cny", "jpy", "huf", "hkd", "nzd", "inr", "czk", "idr", "ils", "mxn", "sgd", "ron", "myr", "php", "gbp", "hrk", "try", "twd", "eur", "dkk", "thb"
            
        *   `discounts` (array): Price breaks / Collection of price breaks, sorted by quantity
            
            Array element:
            
            (map): A single price break in a pricing structure
            
            Map contents:
            
            *   `quantity` (integer): Quantity at which this price break applies
                
            *   `amount` (number): Price per unit at this quantity
                
            
        
    *   `offer/in-stock` (enum): Stocking status at the supplier
        
        Possible values:
        
        "yes", "no", "maybe", "assumed"
        
    *   `offer/reference` (string): Reference information for this offer
        
    *   `offer/comments` (string): Comments for this offer
        
    *   `offer/url` (string): URL for this offer at the supplier's website
        
    *   `offer/expires` (64-bit UNIX timestamp in UTC time zone): Expiration date for the offer. Passing null/nil removes the expiry date
        
    *   `offer/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `offer/entry-id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
        
    *   `offer/attachments` (array): List of attachments for this offer
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    *   `attachment/attachments` (array): List of attachments. DEPRECATED: Use the table-specific attachment keys instead (e.g., :part/attachments, :project/attachments). This key is included in API responses for backward compatibility but will be removed in a future version.
        
        Array element:
        
        (map): An attachment
        
        Map contents:
        
        *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
            
        *   `attachment/type` (enum): Type of attachment
            
            Possible values:
            
            "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
            
        *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
            
        *   `attachment/filename` (string): Original filename of the attachment
            
        *   `attachment/content-type` (string): MIME content type of the attachment
            
        *   `attachment/size` (integer): Size of the attachment in bytes
            
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Purchase Lists
--------------

Purchase list support in the API should be considered as temporary and deprecated, due to upcoming changes to planning and purchasing functionality.

### list/create

Create an empty purchase list (deprecated)

###### Parameters

`[optional] list/name` (string): Purchase list name

###### Return value

(map):

Map contents:

*   `data` (map): Contains the newly created list id
    
    Map contents:
    
    *   `list/id` (string): List id / UUID in 26-character compact form
        
    
*   `list/id`: DEPRECATED: use data/list/id instead
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### list/add-entries

Add entries to a purchase list (deprecated)

###### Parameters

`list/id` (string): List id / UUID in 26-character compact form

`entries` (array):

Array element:

(map): An entry in a purchase list

Map contents:

*   `entry/part-id` (string): Part id / UUID in 26-character compact form
    
*   `entry/quantity` (number): Quantity for this project/BOM/list entry. Must be a non-negative integer for discrete parts, or a non-negative number for unit-based parts.
    

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### list/get

Get data for a single purchase list (deprecated)

###### Parameters

`list/id` (string): List id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (map): Data for a single list / Purchase list data
    
    Map contents:
    
    *   `list/id` (string): List id / UUID in 26-character compact form
        
    *   `list/name` (string): Purchase list name
        
    *   `created` (64-bit UNIX timestamp in UTC time zone): Timestamp when the list was created
        
    *   `owner` (string): Owner user ID
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### list/get-entries

Get list entries (deprecated)

Returns list entries for the given list

###### Parameters

`list/id` (string): List id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `data` (array): A list of entries
    
    Array element:
    
    (map): An entry in a purchase list
    
    Map contents:
    
    *   `entry/id` (string): Entry id (either for a project entry or a purchase list entry) / UUID in 26-character compact form
        
    *   `entry/part-id` (string): Part id / UUID in 26-character compact form
        
    *   `entry/quantity` (number): Quantity for this project/BOM/list entry. Must be a non-negative integer for discrete parts, or a non-negative number for unit-based parts.
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### list/delete

Delete a purchase list (deprecated)

###### Parameters

`list/id` (string): List id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

ID Anything™
------------

### id-anything-qr

Return a PNG image with a QR code of the supplied ID Anything™ id

This is a public API endpoint that does not require authentication. It returns a PNG image directly (the response has a `Content-Type: image/png`) and is designed to easily convert ids into QR codes containing an ID Anything™ URL.

Command-line example:

```
curl 'https://api.partsbox.com/api/1/id-anything-qr?id=6n1n9dhjsagyw92ebhewhxgs7d' -o qr-code.png
```


###### Parameters

`id` (string): UUID in 26-character compact form

###### Return value

`image/png`:

Files
-----

API for downloading files that have been uploaded to PartsBox, such as attachments to parts, projects, etc.

### attachment/add

Upload a file attachment to an object

Uploads a file and attaches it to the specified object. The request must use multipart/form-data encoding. The endpoint is `/api/1/attachment/add`.

Example uploading a PDF datasheet to a part:

```
curl -X POST \
  -H 'Authorization: APIKey partsboxapi_...' \
  -F 'file=@datasheet.pdf' \
  -F 'table=parts' \
  -F 'id=1pbvre0cfg4f58azmvsgetasxq' \
  https://api.partsbox.com/api/1/attachment/add
```


To specify an attachment type explicitly (e.g., `datasheet`):

```
curl -X POST \
  -H 'Authorization: APIKey partsboxapi_...' \
  -F 'file=@datasheet.pdf' \
  -F 'table=parts' \
  -F 'id=1pbvre0cfg4f58azmvsgetasxq' \
  -F 'type=datasheet' \
  https://api.partsbox.com/api/1/attachment/add
```


###### Parameters

`file` (The file to upload (multipart form field)):

`table` (enum): Table name (parts, projects, storage, orders, lots, offers, builds) / Table that supports attachments

Possible values:

"parts", "projects", "storage", "orders", "lots", "offers", "builds"

`id` (string): ID of the object to attach the file to / UUID in 26-character compact form

`[optional] type` (enum): Optional: Override the attachment type (if not specified, type is inferred from content-type) / Type of attachment

Possible values:

"image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"

###### Return value

(map):

Map contents:

*   `data` (map): An attachment
    
    Map contents:
    
    *   `attachment/id` (string): Attachment id / UUID in 26-character compact form
        
    *   `attachment/type` (enum): Type of attachment
        
        Possible values:
        
        "image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"
        
    *   `attachment/timestamp` (64-bit UNIX timestamp in UTC time zone): When the attachment was uploaded
        
    *   `attachment/filename` (string): Original filename of the attachment
        
    *   `attachment/content-type` (string): MIME content type of the attachment
        
    *   `attachment/size` (integer): Size of the attachment in bytes
        
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### attachment/delete

Delete an attachment from an object

Deletes an attachment from the specified object. The attachment file will be permanently removed.

###### Parameters

`table` (enum): Table name (parts, projects, storage, orders, lots, offers, builds) / Table that supports attachments

Possible values:

"parts", "projects", "storage", "orders", "lots", "offers", "builds"

`id` (string): ID of the object containing the attachment / UUID in 26-character compact form

`attachment/id` (string): Attachment id / UUID in 26-character compact form

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### attachment/update

Update metadata for an attachment

Updates the type and/or filename of an existing attachment. At least one of `type` or `filename` must be provided.

Example updating the type of an attachment to 'datasheet':

```
curl -X POST \
  -H 'Authorization: APIKey partsboxapi_...' \
  -H 'Content-Type: application/json' \
  -d '{"table": "parts", "id": "1pbvre0cfg4f58azmvsgetasxq", "attachment/id": "2abcde1cfg4f58azmvsgetasxq", "type": "datasheet"}' \
  https://api.partsbox.com/api/1/attachment/update
```


Example updating the filename:

```
curl -X POST \
  -H 'Authorization: APIKey partsboxapi_...' \
  -H 'Content-Type: application/json' \
  -d '{"table": "parts", "id": "1pbvre0cfg4f58azmvsgetasxq", "attachment/id": "2abcde1cfg4f58azmvsgetasxq", "filename": "new-datasheet.pdf"}' \
  https://api.partsbox.com/api/1/attachment/update
```


###### Parameters

`table` (enum): Table name (parts, projects, storage, orders, lots, offers, builds) / Table that supports attachments

Possible values:

"parts", "projects", "storage", "orders", "lots", "offers", "builds"

`id` (string): ID of the object containing the attachment / UUID in 26-character compact form

`attachment/id` (string): Attachment id / UUID in 26-character compact form

`[optional] type` (enum): New attachment type / Type of attachment

Possible values:

"image", "datasheet", "cad", "gerbers", "kicad-pcb", "eagle-brd", "invoice", "purchase-order", "shipping-list", "other"

`[optional] filename` (string): New filename / Original filename of the attachment

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### files/download

Download a file by its file ID

Returns the file content directly, with appropriate Content-Type header. For certain content types like PDF and images, the file will be displayed inline in the browser, for others it will be downloaded as an attachment.

###### Parameters

`file/id` (string): File ID of a file stored in PartsBox / UUID in 26-character compact form

###### Return value

`file/content` (Raw file content with appropriate Content-Type header):

Custom Fields
-------------

Custom fields can be added to parts, projects, storage locations, orders, lots, and project entries. They are represented as key-value pairs with string values.

### custom-field/update

Update (possibly creating) custom fields for an object

Updates custom fields for a specific object, identified by table and id. The table must be one of these: parts, projects, storage, orders, lots, entries. The custom-fields parameter is an array of key-value pairs.

###### Parameters

`table` (enum): Table name, must be one of: parts, projects, storage, orders, lots, entries, builds

Possible values:

"parts", "projects", "storage", "orders", "lots", "entries", "builds"

`id`:

`custom-fields` (array): A list of custom fields to create or update

Array element:

(map): Custom field, consisting of a key and value

Map contents:

*   `key` (string): Custom field key, limited to 256 characters
    
*   `value` (string): Custom field value, limited to 1024 characters
    

###### Return value

(map):

Map contents:

*   `data`: Updated object with the custom fields
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### custom-field/delete

Delete a custom field from an object

Deletes a custom field from a specific object, identified by table and id. The table must be one of these: parts, projects, storage, orders, lots, entries.

###### Parameters

`table` (enum): Table name, must be one of: parts, projects, storage, orders, lots, entries, builds

Possible values:

"parts", "projects", "storage", "orders", "lots", "entries", "builds"

`id`:

`custom-field-key` (string): Custom field key, limited to 256 characters

###### Return value

(map):

Map contents:

*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

Global
------

### db/download-all-data

###### Parameters

None

###### Return value

(map):

Map contents:

*   `data`: All of your PartsBox data
    
*   `partsbox.status/category` (string): Category of the status or problem encountered, \`status/ok\` if everything is OK
    
*   `partsbox.status/message` (string): Status message with an additional description
    

### 

Table of Contents

*   [Example](#example)
*   [General design and notes](#general-design-and-notes)
    *   [Modes](#modes)
    *   [Passing parameters](#passing-parameters)
    *   [Return values](#return-values)
    *   [Errors](#errors)
    *   [Date and time handling](#date-and-time-handling)
    *   [Areas most likely to change in the future](#areas-most-likely-to-change-in-the-future)
*   [Authentication](#authentication)
*   [Endpoints](#endpoints)
*   [Support, reporting bugs and problems, feature requests](#support-reporting-bugs-and-problems-feature-requests)
*   [Rate limiting](#rate-limiting)
*   [Warnings and pitfalls](#warnings-and-pitfalls)
*   [Terms of Service](#terms-of-service)
*   [Parts](#parts)
    *   [part/get](#part-get)
    *   [part/all](#part-all)
    *   [part/create](#part-create)
    *   [part/update](#part-update)
    *   [part/update-spec-overrides](#part-update-spec-overrides)
    *   [part/delete-spec-override](#part-delete-spec-override)
    *   [part/assign-unit](#part-assign-unit)
    *   [part/delete](#part-delete)
    *   [part/set-image](#part-set-image)
    *   [part/delete-image](#part-delete-image)
    *   [part/add-meta-part-ids](#part-add-meta-part-ids)
    *   [part/remove-meta-part-ids](#part-remove-meta-part-ids)
    *   [part/add-substitute-ids](#part-add-substitute-ids)
    *   [part/remove-substitute-ids](#part-remove-substitute-ids)
    *   [part/update-custom-fields](#part-update-custom-fields)
    *   [part/delete-custom-field](#part-delete-custom-field)
    *   [part/storage](#part-storage)
    *   [part/lots](#part-lots)
    *   [part/stock](#part-stock)
*   [Stock](#stock)
    [](#stock)*   [](#stock)
[stock/add](#stock-add)
    *   [stock/remove](#stock-remove)
    *   [stock/move](#stock-move)
    *   [stock/update](#stock-update)
*   [Lots](#lots)
    [](#lots)*   [](#lots)
[lot/get](#lot-get)
    *   [lot/update](#lot-update)
    *   [lot/all](#lot-all)
*   [Storage](#storage)
    [](#storage)*   [](#storage)
[storage/get](#storage-get)
    *   [storage/all](#storage-all)
    *   [storage/create](#storage-create)
    *   [storage/update](#storage-update)
    *   [storage/rename](#storage-rename)
    *   [storage/change-settings](#storage-change-settings)
    *   [storage/archive](#storage-archive)
    *   [storage/restore](#storage-restore)
    *   [storage/parts](#storage-parts)
    *   [storage/lots](#storage-lots)
*   [Projects](#projects)
    [](#projects)*   [](#projects)
[project/get](#project-get)
    *   [project/all](#project-all)
    *   [project/create](#project-create)
    *   [project/update](#project-update)
    *   [project/create-sub-assembly-part](#project-create-sub-assembly-part)
    *   [project/delete](#project-delete)
    *   [project/get-entries](#project-get-entries)
    *   [project/add-entries](#project-add-entries)
    *   [project/update-entries](#project-update-entries)
    *   [project/delete-entries](#project-delete-entries)
    *   [project/add-substitute-ids](#project-add-substitute-ids)
    *   [project/remove-substitute-ids](#project-remove-substitute-ids)
    *   [project/get-builds](#project-get-builds)
    *   [project/builds](#project-builds)
    *   [project/archive](#project-archive)
    *   [project/restore](#project-restore)
    *   [build/create](#build-create)
    *   [build/get](#build-get)
    *   [build/update](#build-update)
    *   [build/all](#build-all)
*   [Orders](#orders)
    [](#orders)*   [](#orders)
[order/get](#order-get)
    *   [order/all](#order-all)
    *   [order/get-entries](#order-get-entries)
    *   [order/receive](#order-receive)
    *   [order/create](#order-create)
    *   [order/add-entries](#order-add-entries)
    *   [order/delete-entry](#order-delete-entry)
    *   [order/update-entry](#order-update-entry)
    *   [order/update](#order-update)
    *   [order/mark-ordered](#order-mark-ordered)
    *   [order/cancel](#order-cancel)
*   [Offers](#offers)
    [](#offers)*   [](#offers)
[offer/all](#offer-all)
    *   [offer/get](#offer-get)
    *   [offer/add](#offer-add)
    *   [offer/update](#offer-update)
    *   [offer/delete](#offer-delete)
*   [Purchase Lists](#purchase-lists)
    [](#purchase-lists)*   [](#purchase-lists)
[list/create](#list-create)
    *   [list/add-entries](#list-add-entries)
    *   [list/get](#list-get)
    *   [list/get-entries](#list-get-entries)
    *   [list/delete](#list-delete)
*   [ID Anything™](#id-anything)
    [](#id-anything)*   [](#id-anything)
[id-anything-qr](#id-anything-qr)
*   [Files](#files)
    [](#files)*   [](#files)
[attachment/add](#attachment-add)
    *   [attachment/delete](#attachment-delete)
    *   [attachment/update](#attachment-update)
    *   [files/download](#files-download)
*   [Custom Fields](#custom-fields)
    [](#custom-fields)*   [](#custom-fields)
[custom-field/update](#custom-field-update)
    *   [custom-field/delete](#custom-field-delete)
*   [Global](#global)
    [](#global)*   [](#global)
[db/download-all-data](#db-download-all-data)

Control your inventory, ordering and production
